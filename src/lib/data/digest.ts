import "server-only";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { clientEnv } from "@/lib/env";
import { getEmailTransport } from "@/lib/email";
import { digestHtml, digestSubject, digestText, type DigestBirthday } from "@/lib/email/digest";
import { DECISION_LABEL, digestDecision, hasDigestContent, upcomingBirthdays } from "@/lib/email/digest-plan";
import { localDate, safeTimeZone } from "@/lib/time/zoned";
import { listReminders, type ReminderWithPerson } from "./reminders";

const { profiles, reminders, people } = schema;

type Profile = typeof profiles.$inferSelect;

export type DigestResult = { email: string; sent: boolean; reason?: string; count?: number; html?: string };

export type DigestContent = {
  today: string;
  timeZone: string;
  due: ReminderWithPerson[];
  overdue: ReminderWithPerson[];
  birthdays: DigestBirthday[];
  subject: string;
  html: string;
  text: string;
};

/**
 * Start/end of the local day `today` in `timeZone`, computed by Postgres so the digest agrees with
 * every other "today" query (and DST days are 23/25 hours long).
 */
async function dayBounds(today: string, timeZone: string): Promise<{ start: Date; end: Date }> {
  const [row] = await db.execute<{ start: Date | string; end: Date | string }>(
    sql`select (${today}::date)::timestamp at time zone ${timeZone} as "start", (${today}::date + 1)::timestamp at time zone ${timeZone} as "end"`,
  );
  return { start: new Date(row!.start), end: new Date(row!.end) };
}

/** Everything the digest for `profile` on its local `today` contains. Read-only. */
export async function buildDigest(profile: Profile, today: string, timeZone: string, now: Date): Promise<DigestContent> {
  const { start, end } = await dayBounds(today, timeZone);
  // Open reminders due before the end of today (listReminders' `until` is inclusive).
  const open = await listReminders(profile.id, { until: new Date(end.getTime() - 1) });
  const overdue = open.filter((r) => new Date(r.dueAt) < start);
  const due = open.filter((r) => new Date(r.dueAt) >= start);

  const withBirthdays = await db.query.people.findMany({
    where: and(eq(people.ownerId, profile.id), isNull(people.deletedAt), sql`${people.birthday} is not null`),
    columns: { id: true, displayName: true, birthday: true },
  });
  const birthdays: DigestBirthday[] = upcomingBirthdays(withBirthdays, today, 7).map((b) => ({ id: b.id, displayName: b.displayName, birthday: b.birthday, inDays: b.inDays, turning: b.turning }));

  const base = clientEnv.NEXT_PUBLIC_APP_URL;
  const name = profile.displayName?.split(" ")[0] || "there";
  const dateLabel = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone }).format(now);
  const parts = { base, name, dateLabel, due, overdue, birthdays };
  return { today, timeZone, due, overdue, birthdays, subject: digestSubject([...overdue, ...due], birthdays), html: digestHtml(parts), text: digestText(parts) };
}

/**
 * Claims today's digest for a profile — atomically, so overlapping cron runs (pg_cron hourly +
 * Vercel's daily cron) can't both send. Returns the previous value to roll back to if sending
 * fails, or false when today's digest was already claimed. Net effect: `last_digest_on = today`
 * only persists after a successful send.
 */
async function claimDigest(profileId: string, today: string): Promise<{ previous: string | null } | false> {
  const [before] = await db.select({ previous: profiles.lastDigestOn }).from(profiles).where(eq(profiles.id, profileId));
  const rows = await db
    .update(profiles)
    .set({ lastDigestOn: today })
    .where(and(eq(profiles.id, profileId), sql`${profiles.lastDigestOn} is distinct from ${today}::date`))
    .returning({ id: profiles.id });
  return rows.length ? { previous: before?.previous ?? null } : false;
}

/**
 * Sends the daily digest to every profile whose local time has passed its digest hour and that
 * hasn't had one today. Safe to call hourly (pg_cron / Vercel cron). `force` ignores the schedule
 * and the once-a-day rule; `preview` renders without sending or changing anything.
 */
export async function runDigest(opts: { force?: boolean; preview?: boolean; now?: Date } = {}): Promise<DigestResult[]> {
  const now = opts.now ?? new Date();
  const results: DigestResult[] = [];
  const all = await db.query.profiles.findMany();

  for (const p of all) {
    const decision = digestDecision(p, now, { force: opts.force || opts.preview });
    if (!decision.send) {
      results.push({ email: p.email, sent: false, reason: DECISION_LABEL[decision.reason] });
      continue;
    }
    const content = await buildDigest(p, decision.today, decision.timeZone, now);
    if (opts.preview) {
      results.push({ email: p.email, sent: false, reason: "preview", html: content.html });
      continue;
    }
    const count = content.due.length + content.overdue.length;
    if (!hasDigestContent(content)) {
      results.push({ email: p.email, sent: false, reason: "nothing due" });
      continue;
    }
    const transport = await getEmailTransport(p.id);
    if (!transport) {
      results.push({ email: p.email, sent: false, reason: "e-mail not configured", count });
      continue;
    }
    const claim = opts.force ? { previous: p.lastDigestOn } : await claimDigest(p.id, decision.today);
    if (!claim) {
      results.push({ email: p.email, sent: false, reason: DECISION_LABEL.already_sent });
      continue;
    }
    try {
      await transport.send({ to: p.email, subject: content.subject, html: content.html, text: content.text });
    } catch (err) {
      if (!opts.force) await db.update(profiles).set({ lastDigestOn: claim.previous }).where(eq(profiles.id, p.id));
      console.error("digest send failed", err);
      results.push({ email: p.email, sent: false, reason: `send failed: ${(err as Error).message}`.slice(0, 300), count });
      continue;
    }
    if (opts.force) await db.update(profiles).set({ lastDigestOn: decision.today }).where(eq(profiles.id, p.id));
    const ids = [...content.due, ...content.overdue].map((r) => r.id);
    if (ids.length) {
      await db
        .update(reminders)
        .set({ sentAt: now, status: sql`case when ${reminders.status} = 'pending' then 'sent'::reminder_status else ${reminders.status} end` })
        .where(and(inArray(reminders.id, ids), or(eq(reminders.status, "pending"), eq(reminders.status, "snoozed"), eq(reminders.status, "sent"))));
    }
    results.push({ email: p.email, sent: true, count: ids.length });
  }
  return results;
}

async function ownerProfile(ownerId: string): Promise<Profile | null> {
  return (await db.query.profiles.findFirst({ where: eq(profiles.id, ownerId) })) ?? null;
}

/** Today's digest for one owner, rendered but not sent (Settings → Daily digest → Preview). */
export async function renderDigestPreview(ownerId: string, now = new Date()): Promise<DigestContent | null> {
  const p = await ownerProfile(ownerId);
  if (!p) return null;
  const timeZone = safeTimeZone(p.timezone);
  return buildDigest(p, localDate(now, timeZone), timeZone, now);
}

/**
 * E-mails today's digest to the owner as a preview. Doesn't mark reminders as sent and doesn't
 * count as today's digest.
 */
export async function sendDigestPreview(ownerId: string, now = new Date()): Promise<{ ok: boolean; to?: string; error?: string }> {
  const p = await ownerProfile(ownerId);
  if (!p) return { ok: false, error: "No profile" };
  const transport = await getEmailTransport(ownerId);
  if (!transport) return { ok: false, error: "E-mail isn't configured yet (Settings → Connections)." };
  const timeZone = safeTimeZone(p.timezone);
  const content = await buildDigest(p, localDate(now, timeZone), timeZone, now);
  try {
    await transport.send({ to: p.email, subject: `Preview · ${content.subject}`, html: content.html, text: content.text });
    return { ok: true, to: p.email };
  } catch (err) {
    return { ok: false, to: p.email, error: (err as Error).message.slice(0, 300) };
  }
}
