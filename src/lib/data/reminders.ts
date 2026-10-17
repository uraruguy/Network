import "server-only";
import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { ReminderData } from "@/lib/schemas";
import { OPEN_REMINDER_STATUSES } from "./people";

/*
 * Follow-up reminders. `people.next_followup_at` is kept in sync by the `sync_next_followup`
 * database trigger, so nothing here has to maintain it.
 */

const { reminders, people, notes } = schema;

const personCols = { columns: { id: true, displayName: true, avatarUrl: true, headline: true, company: true } } as const;

/** Open reminders (optionally due by `until` / for one person), soonest first. Skips deleted people. */
export async function listReminders(ownerId: string, opts: { until?: Date; personId?: string } = {}) {
  return db.query.reminders.findMany({
    where: and(
      eq(reminders.ownerId, ownerId),
      inArray(reminders.status, [...OPEN_REMINDER_STATUSES]),
      opts.until ? lte(reminders.dueAt, opts.until) : undefined,
      opts.personId ? eq(reminders.personId, opts.personId) : undefined,
      sql`exists (select 1 from people p where p.id = ${reminders.personId} and p.deleted_at is null)`,
    ),
    orderBy: [asc(reminders.dueAt)],
    with: { person: personCols },
  });
}

export type ReminderWithPerson = Awaited<ReturnType<typeof listReminders>>[number];

function getReminder(ownerId: string, id: string) {
  return db.query.reminders.findFirst({ where: and(eq(reminders.ownerId, ownerId), eq(reminders.id, id)), with: { person: personCols } });
}

/**
 * Creates a reminder for one of the owner's people. Returns null if the person isn't theirs.
 * With a client-generated `id`, re-sending is idempotent (the existing reminder is returned).
 */
export async function createReminder(ownerId: string, input: ReminderData) {
  if (input.id) {
    const [existing] = await db.select({ ownerId: reminders.ownerId }).from(reminders).where(eq(reminders.id, input.id));
    if (existing) return existing.ownerId === ownerId ? getReminder(ownerId, input.id) : null;
  }
  const [person] = await db.select({ id: people.id }).from(people).where(and(eq(people.ownerId, ownerId), eq(people.id, input.personId), isNull(people.deletedAt)));
  if (!person) return null;
  let noteId: string | null = null;
  if (input.noteId) {
    const [note] = await db.select({ id: notes.id }).from(notes).where(and(eq(notes.ownerId, ownerId), eq(notes.id, input.noteId)));
    noteId = note?.id ?? null;
  }
  const [row] = await db
    .insert(reminders)
    .values({
      ...(input.id ? { id: input.id } : {}),
      ownerId,
      personId: input.personId,
      noteId,
      dueAt: new Date(input.dueAt),
      message: input.message ?? null,
      recurrence: input.recurrence,
      recurrenceDays: input.recurrenceDays ?? null,
    })
    .returning({ id: reminders.id });
  return getReminder(ownerId, row!.id);
}

/** Next occurrence of a recurring reminder, or null when it doesn't recur. */
export function nextDue(from: Date, recurrence: schema.Reminder["recurrence"], days: number | null) {
  const d = new Date(from);
  switch (recurrence) {
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      return d;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      return d;
    case "semiannual":
      d.setMonth(d.getMonth() + 6);
      return d;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      return d;
    case "custom_days":
      d.setDate(d.getDate() + (days ?? 30));
      return d;
    default:
      return null;
  }
}

/** Marks done; recurring reminders roll forward to the next occurrence instead of closing. */
export async function completeReminder(ownerId: string, id: string) {
  const r = await db.query.reminders.findFirst({ where: and(eq(reminders.ownerId, ownerId), eq(reminders.id, id)) });
  if (!r) return null;
  const next = nextDue(new Date(), r.recurrence, r.recurrenceDays);
  const scope = and(eq(reminders.ownerId, ownerId), eq(reminders.id, id));
  await db.transaction(async (tx) => {
    if (next) await tx.update(reminders).set({ dueAt: next, status: "pending", sentAt: null, doneAt: null }).where(scope);
    else await tx.update(reminders).set({ status: "done", doneAt: new Date() }).where(scope);
    await tx
      .update(people)
      .set({ lastInteractionAt: sql`greatest(coalesce(${people.lastInteractionAt}, 'epoch'::timestamptz), now())` })
      .where(and(eq(people.ownerId, ownerId), eq(people.id, r.personId)));
  });
  return getReminder(ownerId, id);
}

/** Pushes a reminder `days` ahead (09:00 server time). */
export async function snoozeReminder(ownerId: string, id: string, days: number) {
  const due = new Date();
  due.setDate(due.getDate() + days);
  due.setHours(9, 0, 0, 0);
  const rows = await db
    .update(reminders)
    .set({ dueAt: due, status: "snoozed", sentAt: null })
    .where(and(eq(reminders.ownerId, ownerId), eq(reminders.id, id)))
    .returning({ id: reminders.id });
  return rows.length ? getReminder(ownerId, id) : null;
}

/** Moves a reminder to an exact time and re-opens it. */
export async function rescheduleReminder(ownerId: string, id: string, dueAt: Date) {
  const rows = await db
    .update(reminders)
    .set({ dueAt, status: "pending", sentAt: null, doneAt: null })
    .where(and(eq(reminders.ownerId, ownerId), eq(reminders.id, id)))
    .returning({ id: reminders.id });
  return rows.length ? getReminder(ownerId, id) : null;
}

/** Edits a reminder in place (message, repeat, due time). A new `dueAt` re-opens it. */
export async function updateReminder(
  ownerId: string,
  id: string,
  patch: { dueAt?: Date; message?: string | null; recurrence?: schema.Reminder["recurrence"]; recurrenceDays?: number | null },
) {
  const values: Partial<typeof reminders.$inferInsert> = {};
  if (patch.dueAt) Object.assign(values, { dueAt: patch.dueAt, status: "pending", sentAt: null, doneAt: null });
  if (patch.message !== undefined) values.message = patch.message;
  if (patch.recurrence !== undefined) {
    values.recurrence = patch.recurrence;
    values.recurrenceDays = patch.recurrence === "custom_days" ? (patch.recurrenceDays ?? 30) : null;
  } else if (patch.recurrenceDays !== undefined) values.recurrenceDays = patch.recurrenceDays;
  if (Object.keys(values).length) {
    const rows = await db.update(reminders).set(values).where(and(eq(reminders.ownerId, ownerId), eq(reminders.id, id))).returning({ id: reminders.id });
    if (!rows.length) return null;
  }
  return getReminder(ownerId, id);
}

export async function deleteReminder(ownerId: string, id: string): Promise<boolean> {
  const rows = await db.delete(reminders).where(and(eq(reminders.ownerId, ownerId), eq(reminders.id, id))).returning({ id: reminders.id });
  return rows.length > 0;
}
