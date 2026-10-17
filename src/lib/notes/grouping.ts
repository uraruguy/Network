/**
 * Apple Notes list grouping: Pinned, Today, Yesterday, Previous 7 Days, Previous 30 Days, then
 * the months of the current year, then whole years. Notes are grouped by when the conversation
 * happened (`occurredAt`), newest first. Local calendar days. Pure.
 */
import { differenceInCalendarDays, startOfDay } from "date-fns";
import { dateTimeFormat, toDate, type DateInput } from "@/lib/format";

export type GroupableNote = { id: string; occurredAt: DateInput; pinned?: boolean | null };

export type NoteSection<T> = { key: string; label: string; items: T[] };

const time = (d: DateInput) => toDate(d)?.getTime() ?? 0;

/** Newest first; ties broken by id so the order is stable. */
export function sortNotes<T extends GroupableNote>(notes: readonly T[]): T[] {
  return [...notes].sort((a, b) => time(b.occurredAt) - time(a.occurredAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

/** Section a date falls into, relative to `now`. */
export function bucketFor(date: DateInput, now: Date | number): { key: string; label: string; order: number } {
  const d = toDate(date) ?? new Date(0);
  const today = startOfDay(now);
  const days = differenceInCalendarDays(today, d); // 0 today, 1 yesterday, negative = future
  if (days < 0) return { key: "upcoming", label: "Upcoming", order: 0 };
  if (days === 0) return { key: "today", label: "Today", order: 1 };
  if (days === 1) return { key: "yesterday", label: "Yesterday", order: 2 };
  if (days <= 7) return { key: "7d", label: "Previous 7 Days", order: 3 };
  if (days <= 30) return { key: "30d", label: "Previous 30 Days", order: 4 };
  if (d.getFullYear() === today.getFullYear()) {
    const month = d.getMonth();
    // Later months first: order 100 + (11 - month).
    return { key: `m-${month}`, label: dateTimeFormat("en-GB", { month: "long" }).format(d), order: 100 + (11 - month) };
  }
  const year = d.getFullYear();
  return { key: `y-${year}`, label: String(year), order: 10_000 + (today.getFullYear() - year) };
}

/** Groups notes into Apple Notes sections. Pinned notes form their own first section. */
export function groupNotes<T extends GroupableNote>(notes: readonly T[], now: Date | number = Date.now()): NoteSection<T>[] {
  const sorted = sortNotes(notes);
  const pinned = sorted.filter((n) => n.pinned);
  const buckets = new Map<string, NoteSection<T> & { order: number }>();
  for (const n of sorted) {
    if (n.pinned) continue;
    const b = bucketFor(n.occurredAt, now);
    let s = buckets.get(b.key);
    if (!s) buckets.set(b.key, (s = { key: b.key, label: b.label, order: b.order, items: [] }));
    s.items.push(n);
  }
  const sections: NoteSection<T>[] = [...buckets.values()].sort((a, b) => a.order - b.order).map(({ key, label, items }) => ({ key, label, items }));
  return pinned.length ? [{ key: "pinned", label: "Pinned", items: pinned }, ...sections] : sections;
}

/**
 * The short date in a note row: "14:32" today, "Yesterday", a weekday within the last week,
 * "14 Oct" this year, "14 Oct 2025" before.
 */
export function formatNoteRowDate(date: DateInput, now: Date | number = Date.now()): string {
  const d = toDate(date);
  if (!d) return "";
  const days = differenceInCalendarDays(startOfDay(now), d);
  if (days === 0) return dateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(d);
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return dateTimeFormat("en-GB", { weekday: "long" }).format(d);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return dateTimeFormat("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(d);
}

/** "14 October 2026 at 14:32" — the date line at the top of a note. */
export function formatNoteLongDate(date: DateInput): string {
  const d = toDate(date);
  if (!d) return "";
  const day = dateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(d);
  const t = dateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(d);
  return `${day} at ${t}`;
}
