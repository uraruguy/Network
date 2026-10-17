/**
 * Which imported follow-ups become reminders.
 *  - explicit future date → reminder on that date
 *  - relative date ("čez 2 tedna") resolved from the note date that lands in the future → reminder
 *  - undated, from a note ≤60 days old → one combined reminder per person, spread over the next
 *    14 days (≤3 per day across all people)
 *  - everything else → "Open threads" checklist in the person's key-facts note
 * At most one imported reminder per person; the rest become open threads.
 */
import { fromIsoDay, resolveWhen } from "./dates";

const DAY = 86_400_000;
export const RECENT_DAYS = 60;
export const SPREAD_DAYS = 14;
export const PER_DAY = 3;
export const REMINDER_HOUR_UTC = 8;

export type FollowUpIn = { what: string; when: string | null; explicitDate?: string | null; noteDate: Date; sourceItemId?: string | null; sourceTitle?: string | null };
export type OpenThread = { what: string; when: string | null; noteDate: Date; sourceItemId: string | null; sourceTitle: string | null; why: "past" | "undated-old" | "extra" | "overflow" | "disabled" };
export type ReminderPlan = { dueAt: Date; message: string; kind: "dated" | "combined"; sourceItemIds: string[] } | null;
export type PersonPlan = { reminder: ReminderPlan; openThreads: OpenThread[] };

export function atReminderHour(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), REMINDER_HOUR_UTC));
}

function startOfDayUtc(d: Date) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function planReminders(people: { key: string; createReminder: boolean; followUps: FollowUpIn[] }[], now = new Date()): Map<string, PersonPlan> {
  const out = new Map<string, PersonPlan>();
  const combinedQueue: { key: string; items: FollowUpIn[]; newest: number }[] = [];
  const today = startOfDayUtc(now);
  // Day slots already used by dated reminders count toward the ≤3/day spread.
  const slots = new Map<number, number>();

  for (const p of people) {
    const plan: PersonPlan = { reminder: null, openThreads: [] };
    out.set(p.key, plan);
    const thread = (f: FollowUpIn, why: OpenThread["why"]): OpenThread => ({ what: f.what, when: f.when, noteDate: f.noteDate, sourceItemId: f.sourceItemId ?? null, sourceTitle: f.sourceTitle ?? null, why });
    if (!p.createReminder) {
      plan.openThreads.push(...p.followUps.map((f) => thread(f, "disabled")));
      continue;
    }
    const dated: { f: FollowUpIn; due: Date }[] = [];
    const recentUndated: FollowUpIn[] = [];
    for (const f of p.followUps) {
      const explicit = fromIsoDay(f.explicitDate ?? null);
      const due = explicit ?? resolveWhen(f.when, f.noteDate);
      if (due) {
        if (startOfDayUtc(due) > today) dated.push({ f, due });
        else plan.openThreads.push(thread(f, "past"));
      } else if (now.getTime() - f.noteDate.getTime() <= RECENT_DAYS * DAY) recentUndated.push(f);
      else plan.openThreads.push(thread(f, "undated-old"));
    }
    if (dated.length) {
      dated.sort((a, b) => a.due.getTime() - b.due.getTime());
      const first = dated[0]!;
      plan.reminder = { dueAt: atReminderHour(first.due), message: first.f.what, kind: "dated", sourceItemIds: first.f.sourceItemId ? [first.f.sourceItemId] : [] };
      const day = startOfDayUtc(first.due);
      slots.set(day, (slots.get(day) ?? 0) + 1);
      plan.openThreads.push(...dated.slice(1).map((d) => thread(d.f, "extra")), ...recentUndated.map((f) => thread(f, "extra")));
    } else if (recentUndated.length) {
      combinedQueue.push({ key: p.key, items: recentUndated, newest: Math.max(...recentUndated.map((f) => f.noteDate.getTime())) });
    }
  }

  // Spread combined reminders over the next SPREAD_DAYS days, most recent notes first, ≤PER_DAY per day.
  combinedQueue.sort((a, b) => b.newest - a.newest || a.key.localeCompare(b.key));
  let day = 1;
  for (const q of combinedQueue) {
    const plan = out.get(q.key)!;
    while (day <= SPREAD_DAYS && (slots.get(today + day * DAY) ?? 0) >= PER_DAY) day++;
    if (day > SPREAD_DAYS) {
      plan.openThreads.push(...q.items.map((f) => ({ what: f.what, when: f.when, noteDate: f.noteDate, sourceItemId: f.sourceItemId ?? null, sourceTitle: f.sourceTitle ?? null, why: "overflow" as const })));
      continue;
    }
    const slotDay = today + day * DAY;
    slots.set(slotDay, (slots.get(slotDay) ?? 0) + 1);
    const message = q.items.length === 1 ? q.items[0]!.what : q.items.map((f) => f.what).join(" · ");
    plan.reminder = {
      dueAt: atReminderHour(new Date(slotDay)),
      message: message.length > 500 ? `${message.slice(0, 497)}…` : message,
      kind: "combined",
      sourceItemIds: [...new Set(q.items.map((f) => f.sourceItemId).filter((x): x is string => !!x))],
    };
  }
  return out;
}

/** Markdown checklist for the key-facts note. */
export function openThreadsMarkdown(threads: OpenThread[]): string {
  if (!threads.length) return "";
  const lines = threads.map((t) => {
    const src = [t.sourceTitle ? `“${t.sourceTitle}”` : null, t.noteDate.toISOString().slice(0, 10), t.when ? `when: ${t.when}` : null].filter(Boolean).join(", ");
    return `- [ ] ${t.what}${src ? ` _(${src})_` : ""}`;
  });
  return `## Open threads\n\n${lines.join("\n")}`;
}
