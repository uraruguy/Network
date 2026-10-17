import "server-only";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { clientEnv } from "@/lib/env";
import { digestHtml, digestSubject } from "@/lib/email/digest";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { listReminders } from "./reminders";

const { profiles, reminders, people } = schema;

/**
 * Claims today's digest for a profile (atomic, so overlapping cron runs can't double-send).
 * Returns the previous value to roll back with if sending fails, or false if already claimed.
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

function localParts(now: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour === "24" ? 0 : parts.hour) };
}

/**
 * Sends the daily digest to every profile whose local time has passed their digest hour and who
 * hasn't received one today. Safe to call hourly (pg_cron / Vercel cron) or manually with force.
 */
export async function runDigest(opts: { force?: boolean; preview?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const results: { email: string; sent: boolean; reason?: string; count?: number; html?: string }[] = [];
  const all = await db.query.profiles.findMany();
  const base = clientEnv.NEXT_PUBLIC_APP_URL;

  for (const p of all) {
    const { date: today, hour } = localParts(now, p.timezone);
    if (!opts.force && !opts.preview) {
      if (!p.digestEnabled) { results.push({ email: p.email, sent: false, reason: "disabled" }); continue; }
      if (hour < p.digestHour) { results.push({ email: p.email, sent: false, reason: `before ${p.digestHour}:00 local` }); continue; }
      if (p.lastDigestOn === today) { results.push({ email: p.email, sent: false, reason: "already sent today" }); continue; }
    }

    const endOfToday = new Date(`${today}T23:59:59`);
    const pending = await listReminders(p.id, { until: endOfToday });
    const startOfToday = new Date(`${today}T00:00:00`);
    const overdue = pending.filter((r) => new Date(r.dueAt) < startOfToday);
    const due = pending.filter((r) => new Date(r.dueAt) >= startOfToday);

    const bdays = await db.query.people.findMany({ where: and(eq(people.ownerId, p.id), isNull(people.deletedAt), sql`${people.birthday} is not null`), columns: { id: true, displayName: true, birthday: true } });
    const y = Number(today.slice(0, 4));
    const birthdays = bdays
      .map((b) => {
        const [, m, d] = b.birthday!.split("-").map(Number) as [number, number, number];
        let next = new Date(y, m - 1, d);
        const t0 = new Date(today + "T00:00:00");
        if (next < t0) next = new Date(y + 1, m - 1, d);
        const inDays = Math.round((next.getTime() - t0.getTime()) / 86_400_000);
        return { id: b.id, displayName: b.displayName, birthday: b.birthday!, inDays };
      })
      .filter((b) => b.inDays <= 7)
      .sort((a, b) => a.inDays - b.inDays);

    const dateLabel = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: p.timezone }).format(now);
    if (opts.preview) { results.push({ email: p.email, sent: false, reason: "preview", html: digestHtml({ base, name: p.displayName ?? "Jakob", dateLabel, due, overdue, birthdays }) }); continue; }
    if (!due.length && !overdue.length && !birthdays.length) { results.push({ email: p.email, sent: false, reason: "nothing due" }); continue; }
    if (!emailConfigured()) { results.push({ email: p.email, sent: false, reason: "RESEND_API_KEY missing", count: due.length + overdue.length }); continue; }

    const claim = opts.force ? { previous: p.lastDigestOn } : await claimDigest(p.id, today);
    if (!claim) { results.push({ email: p.email, sent: false, reason: "already sent today" }); continue; }
    try {
      await sendEmail({ to: p.email, subject: digestSubject([...overdue, ...due], birthdays), html: digestHtml({ base, name: p.displayName ?? "Jakob", dateLabel, due, overdue, birthdays }) });
    } catch (err) {
      if (!opts.force) await db.update(profiles).set({ lastDigestOn: claim.previous }).where(eq(profiles.id, p.id));
      throw err;
    }
    const ids = [...due, ...overdue].map((r) => r.id);
    if (ids.length) await db.update(reminders).set({ sentAt: now, status: sql`case when ${reminders.status} = 'pending' then 'sent'::reminder_status else ${reminders.status} end` }).where(and(inArray(reminders.id, ids), or(eq(reminders.status, "pending"), eq(reminders.status, "snoozed"), eq(reminders.status, "sent"))));
    results.push({ email: p.email, sent: true, count: ids.length });
  }
  return results;
}

