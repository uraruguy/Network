/**
 * Quick-pick date presets (pure; unit-tested in presets.test.ts).
 * Weeks start on Monday. All dates are local calendar days at 00:00.
 */
import { addDays, addMonths, format, isValid, isSameDay, nextSaturday, parse, startOfDay, startOfWeek, addWeeks, subDays, subMonths, isBefore, isAfter } from "date-fns";

export type PresetKind = "followup" | "past" | "none";

export type DatePreset = { id: string; label: string; date: Date };

export const WEEK_STARTS_ON = 1 as const;

/** Local `yyyy-MM-dd`. */
export function toISODate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Parses local `yyyy-MM-dd`; null for empty/invalid input. */
export function fromISODate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = parse(s, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : null;
}

/** Drop presets that land on an already-listed day (earlier label wins), then order by date. */
function dedupe(presets: DatePreset[]): DatePreset[] {
  const out: DatePreset[] = [];
  for (const p of presets) if (!out.some((o) => isSameDay(o.date, p.date))) out.push(p);
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Follow-up presets: Tomorrow · This weekend · Next week · In 2 weeks · In 1 month ·
 * In 3 months · In 6 months. "This weekend" is the coming Saturday (on a weekend it becomes
 * "Next weekend"); "Next week" is next Monday. Dates that collide keep the earlier label.
 */
export function followupPresets(now: Date = new Date()): DatePreset[] {
  const today = startOfDay(now);
  const dow = today.getDay(); // 0 Sun … 6 Sat
  const weekend = dow === 6 || dow === 0;
  return dedupe([
    { id: "tomorrow", label: "Tomorrow", date: addDays(today, 1) },
    weekend
      ? { id: "next-weekend", label: "Next weekend", date: nextSaturday(today) }
      : { id: "this-weekend", label: "This weekend", date: nextSaturday(today) },
    { id: "next-week", label: "Next week", date: addWeeks(startOfWeek(today, { weekStartsOn: WEEK_STARTS_ON }), 1) },
    { id: "2-weeks", label: "In 2 weeks", date: addDays(today, 14) },
    { id: "1-month", label: "In 1 month", date: addMonths(today, 1) },
    { id: "3-months", label: "In 3 months", date: addMonths(today, 3) },
    { id: "6-months", label: "In 6 months", date: addMonths(today, 6) },
  ]);
}

/**
 * Past presets (when something happened): Today · Yesterday · Last weekend · Last week ·
 * 2 weeks ago · Last month · 3 months ago. "Last weekend" is the most recent Saturday before today.
 */
export function pastPresets(now: Date = new Date()): DatePreset[] {
  const today = startOfDay(now);
  const dow = today.getDay();
  const lastSaturday = subDays(today, dow === 6 ? 7 : dow + 1);
  // Most recent first.
  return dedupe([
    { id: "today", label: "Today", date: today },
    { id: "yesterday", label: "Yesterday", date: subDays(today, 1) },
    { id: "last-weekend", label: "Last weekend", date: lastSaturday },
    { id: "last-week", label: "Last week", date: subDays(today, 7) },
    { id: "2-weeks-ago", label: "2 weeks ago", date: subDays(today, 14) },
    { id: "last-month", label: "Last month", date: subMonths(today, 1) },
    { id: "3-months-ago", label: "3 months ago", date: subMonths(today, 3) },
  ]).reverse();
}

/** Presets for a kind, limited to `[min, max]` (inclusive). */
export function presetsFor(kind: PresetKind, now: Date = new Date(), range: { min?: Date | null; max?: Date | null } = {}): DatePreset[] {
  const list = kind === "followup" ? followupPresets(now) : kind === "past" ? pastPresets(now) : [];
  const min = range.min ? startOfDay(range.min) : null;
  const max = range.max ? startOfDay(range.max) : null;
  return list.filter((p) => (!min || !isBefore(p.date, min)) && (!max || !isAfter(p.date, max)));
}

/** Clamp a date into `[min, max]`. */
export function clampDate(d: Date, min?: Date | null, max?: Date | null): Date {
  if (min && isBefore(d, startOfDay(min))) return startOfDay(min);
  if (max && isAfter(d, startOfDay(max))) return startOfDay(max);
  return d;
}

/** "HH:mm" options every `step` minutes (default 15). */
export function timeOptions(step = 15): string[] {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += step) out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  return out;
}

/** Round "HH:mm" to the nearest step (for snapping arbitrary times onto the 15-min list). */
export function snapTime(time: string, step = 15): string {
  const [h, m] = time.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return "09:00";
  const total = Math.min(24 * 60 - step, Math.round((h * 60 + m) / step) * step);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
