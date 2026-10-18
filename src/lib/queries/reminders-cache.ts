/**
 * Pure helpers for optimistic reminder updates (unit-tested in reminders-cache.test.ts).
 *
 * Reminders live in two kinds of cache entries: the person detail (`person.reminders`, open
 * reminders soonest first, plus `nextFollowupAt`) and the reminder lists behind Today
 * (`["reminders", { until?, personId? }]`, rows carry their `person`). Every change is expressed
 * once as a `ReminderChange` and applied to whichever lists are cached.
 */
import type { Recurrence } from "@/lib/constants";

/** The fields optimistic updates touch. Dates are ISO strings on the wire (typed as Date upstream). */
export type ReminderLike = {
  id: string;
  personId: string;
  dueAt: string | Date;
  recurrence: Recurrence;
  recurrenceDays: number | null;
  message: string | null;
  status: string;
};

export type ReminderPatch = Partial<Pick<ReminderLike, "dueAt" | "message" | "recurrence" | "recurrenceDays" | "status">> & { noteId?: string | null };

export type ReminderChange =
  /** Insert or replace (create, undo of a delete, server echo). */
  | { type: "upsert"; reminder: ReminderLike & Record<string, unknown> }
  | { type: "patch"; id: string; patch: ReminderPatch }
  | { type: "remove"; id: string };

export type ListFilter = { until?: string; personId?: string };

const time = (d: string | Date) => new Date(d).getTime();

const byDue = <T extends Pick<ReminderLike, "dueAt" | "id">>(a: T, b: T) => time(a.dueAt) - time(b.dueAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Does a reminder belong in a list fetched with `filter`? */
export function matchesFilter(r: Pick<ReminderLike, "dueAt" | "personId">, filter: ListFilter = {}): boolean {
  if (filter.personId && r.personId !== filter.personId) return false;
  if (filter.until && time(r.dueAt) > time(filter.until)) return false;
  return true;
}

/**
 * Applies a change to one cached list (open reminders, soonest first). Rows that stop matching
 * the list's filter (e.g. snoozed past Today's window) drop out; `toRow` builds the list's row
 * shape for inserts (return null to skip, e.g. when the person isn't known).
 */
export function applyChange<T extends ReminderLike>(
  list: readonly T[],
  change: ReminderChange,
  filter: ListFilter = {},
  toRow: (r: ReminderLike & Record<string, unknown>, existing?: T) => T | null = (r, existing) => ({ ...existing, ...r }) as unknown as T,
): T[] {
  switch (change.type) {
    case "remove":
      return list.filter((r) => r.id !== change.id);
    case "patch": {
      const out: T[] = [];
      for (const r of list) {
        if (r.id !== change.id) out.push(r);
        else {
          const next = { ...r, ...change.patch } as T;
          if (next.status !== "done" && matchesFilter(next, filter)) out.push(next);
        }
      }
      return out.sort(byDue);
    }
    case "upsert": {
      const existing = list.find((r) => r.id === change.reminder.id);
      const rest = list.filter((r) => r.id !== change.reminder.id);
      if (change.reminder.status === "done" || !matchesFilter(change.reminder, filter)) return rest;
      const row = toRow(change.reminder, existing);
      return row ? [...rest, row].sort(byDue) : rest;
    }
  }
}

/** Earliest open due date (mirrors the `sync_next_followup` trigger), or null. */
export function earliestDue(list: readonly Pick<ReminderLike, "dueAt">[]): string | null {
  let best: number | null = null;
  for (const r of list) {
    const t = time(r.dueAt);
    if (best === null || t < best) best = t;
  }
  return best === null ? null : new Date(best).toISOString();
}

/** Looks a reminder up by id across lists (first hit wins). */
export function findIn<T extends { id: string }>(lists: readonly (readonly T[] | undefined)[], id: string): T | undefined {
  for (const l of lists) {
    const hit = l?.find((r) => r.id === id);
    if (hit) return hit;
  }
  return undefined;
}
