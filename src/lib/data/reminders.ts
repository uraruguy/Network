import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { ReminderData } from "@/lib/schemas";

const { reminders, people } = schema;

const personCols = { columns: { id: true, displayName: true, avatarUrl: true, headline: true, company: true } } as const;

export async function listReminders(ownerId: string, opts: { until?: Date; personId?: string } = {}) {
  return db.query.reminders.findMany({
    where: and(
      eq(reminders.ownerId, ownerId),
      inArray(reminders.status, ["pending", "sent", "snoozed"]),
      opts.until ? lte(reminders.dueAt, opts.until) : undefined,
      opts.personId ? eq(reminders.personId, opts.personId) : undefined,
    ),
    orderBy: [asc(reminders.dueAt)],
    with: { person: personCols },
  });
}

export type ReminderWithPerson = Awaited<ReturnType<typeof listReminders>>[number];

async function syncNextFollowup(ownerId: string, personId: string) {
  const next = await db.query.reminders.findFirst({
    where: and(eq(reminders.ownerId, ownerId), eq(reminders.personId, personId), inArray(reminders.status, ["pending", "sent", "snoozed"])),
    orderBy: [asc(reminders.dueAt)],
  });
  await db.update(people).set({ nextFollowupAt: next?.dueAt ?? null }).where(eq(people.id, personId));
}

export async function createReminder(ownerId: string, input: ReminderData) {
  const [row] = await db
    .insert(reminders)
    .values({ ownerId, personId: input.personId, dueAt: new Date(input.dueAt), message: input.message ?? null, recurrence: input.recurrence, recurrenceDays: input.recurrenceDays ?? null })
    .returning();
  await syncNextFollowup(ownerId, input.personId);
  return db.query.reminders.findFirst({ where: eq(reminders.id, row!.id), with: { person: personCols } });
}

function nextDue(from: Date, recurrence: schema.Reminder["recurrence"], days: number | null) {
  const d = new Date(from);
  switch (recurrence) {
    case "monthly": d.setMonth(d.getMonth() + 1); return d;
    case "quarterly": d.setMonth(d.getMonth() + 3); return d;
    case "semiannual": d.setMonth(d.getMonth() + 6); return d;
    case "yearly": d.setFullYear(d.getFullYear() + 1); return d;
    case "custom_days": d.setDate(d.getDate() + (days ?? 30)); return d;
    default: return null;
  }
}

/** Marks done; recurring reminders roll forward to the next occurrence instead of closing. */
export async function completeReminder(ownerId: string, id: string) {
  const r = await db.query.reminders.findFirst({ where: and(eq(reminders.ownerId, ownerId), eq(reminders.id, id)) });
  if (!r) return null;
  const next = nextDue(new Date(), r.recurrence, r.recurrenceDays);
  if (next) {
    await db.update(reminders).set({ dueAt: next, status: "pending", sentAt: null, doneAt: null }).where(eq(reminders.id, id));
  } else {
    await db.update(reminders).set({ status: "done", doneAt: new Date() }).where(eq(reminders.id, id));
  }
  await db.update(people).set({ lastInteractionAt: sql`greatest(coalesce(${people.lastInteractionAt}, 'epoch'::timestamptz), now())` }).where(eq(people.id, r.personId));
  await syncNextFollowup(ownerId, r.personId);
  return db.query.reminders.findFirst({ where: eq(reminders.id, id), with: { person: personCols } });
}

export async function snoozeReminder(ownerId: string, id: string, days: number) {
  const r = await db.query.reminders.findFirst({ where: and(eq(reminders.ownerId, ownerId), eq(reminders.id, id)) });
  if (!r) return null;
  const due = new Date();
  due.setDate(due.getDate() + days);
  due.setHours(9, 0, 0, 0);
  await db.update(reminders).set({ dueAt: due, status: "snoozed", sentAt: null }).where(eq(reminders.id, id));
  await syncNextFollowup(ownerId, r.personId);
  return db.query.reminders.findFirst({ where: eq(reminders.id, id), with: { person: personCols } });
}

export async function deleteReminder(ownerId: string, id: string) {
  const r = await db.query.reminders.findFirst({ where: and(eq(reminders.ownerId, ownerId), eq(reminders.id, id)) });
  if (!r) return;
  await db.delete(reminders).where(eq(reminders.id, id));
  await syncNextFollowup(ownerId, r.personId);
}
