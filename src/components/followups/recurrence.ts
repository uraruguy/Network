/**
 * Follow-up scheduling helpers (pure; unit-tested in recurrence.test.ts).
 *
 * The API stores repeats as `recurrence` (none | monthly | quarterly | semiannual | yearly |
 * custom_days) + `recurrenceDays`. The chooser speaks in friendlier terms — preset chips and a
 * custom "every N days/weeks/months" — and these functions translate both ways.
 */
import { addDays, addMonths, addYears, isSameDay, startOfDay } from "date-fns";
import type { Recurrence } from "@/lib/constants";
import { followupPresets, toISODate } from "@/components/ui/date/presets";
import { formatShortDate } from "@/lib/format";

/* ------------------------------------------------------------------ */
/*  Repeat                                                             */
/* ------------------------------------------------------------------ */

export type RepeatUnit = "days" | "weeks" | "months";
export type RepeatPreset = "none" | "monthly" | "quarterly" | "semiannual" | "yearly" | "custom";
export type RepeatValue = { preset: RepeatPreset; every: number; unit: RepeatUnit };

export const NO_REPEAT: RepeatValue = { preset: "none", every: 2, unit: "weeks" };

export const REPEAT_PRESETS: { value: RepeatPreset; label: string }[] = [
  { value: "none", label: "None" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semiannual", label: "Every 6 months" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom" },
];

const DAYS_PER: Record<RepeatUnit, number> = { days: 1, weeks: 7, months: 30 };
const MONTH_PRESETS: Partial<Record<number, Recurrence>> = { 1: "monthly", 3: "quarterly", 6: "semiannual", 12: "yearly" };

/** Chooser value → API fields. Custom months that match a calendar preset use it (exact months). */
export function toRecurrence(r: RepeatValue): { recurrence: Recurrence; recurrenceDays: number | null } {
  if (r.preset === "custom") {
    const every = Math.max(1, Math.round(r.every || 1));
    const named = r.unit === "months" ? MONTH_PRESETS[every] : undefined;
    if (named) return { recurrence: named, recurrenceDays: null };
    return { recurrence: "custom_days", recurrenceDays: Math.min(3650, every * DAYS_PER[r.unit]) };
  }
  return { recurrence: r.preset, recurrenceDays: null };
}

/** API fields → chooser value. `custom_days` picks the largest unit that divides evenly. */
export function fromRecurrence(recurrence: Recurrence, days: number | null | undefined): RepeatValue {
  if (recurrence !== "custom_days") return { ...NO_REPEAT, preset: recurrence };
  const d = Math.max(1, days ?? 30);
  if (d % 30 === 0) return { preset: "custom", every: d / 30, unit: "months" };
  if (d % 7 === 0) return { preset: "custom", every: d / 7, unit: "weeks" };
  return { preset: "custom", every: d, unit: "days" };
}

/** "every 3 months", "every 2 weeks", "every day" — or null when it doesn't repeat. */
export function repeatLabel(recurrence: Recurrence, days?: number | null): string | null {
  switch (recurrence) {
    case "none":
      return null;
    case "monthly":
      return "every month";
    case "quarterly":
      return "every 3 months";
    case "semiannual":
      return "every 6 months";
    case "yearly":
      return "every year";
    case "custom_days": {
      const { every, unit } = fromRecurrence("custom_days", days);
      if (every === 1) return `every ${unit.slice(0, -1)}`;
      return `every ${every} ${unit}`;
    }
  }
}

/** Next occurrence after `from` (mirrors the server's `nextDue`), or null when it doesn't repeat. */
export function nextOccurrence(from: Date, recurrence: Recurrence, days: number | null | undefined): Date | null {
  switch (recurrence) {
    case "monthly":
      return addMonths(from, 1);
    case "quarterly":
      return addMonths(from, 3);
    case "semiannual":
      return addMonths(from, 6);
    case "yearly":
      return addYears(from, 1);
    case "custom_days":
      return addDays(from, days ?? 30);
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Day presets                                                        */
/* ------------------------------------------------------------------ */

export type DayPreset = { id: string; label: string; short: string; date: string };

const PRESET_LABELS: Record<string, { label: string; short: string }> = {
  tomorrow: { label: "Tomorrow", short: "Tomorrow" },
  "this-weekend": { label: "This weekend", short: "Weekend" },
  "next-weekend": { label: "Next weekend", short: "Weekend" },
  "next-week": { label: "Next week", short: "Next week" },
  "2-weeks": { label: "2 weeks", short: "2 weeks" },
  "1-month": { label: "1 month", short: "1 month" },
  "3-months": { label: "3 months", short: "3 months" },
  "6-months": { label: "6 months", short: "6 months" },
};

/** Follow-up quick picks (Tomorrow … 6 months) as local "yyyy-MM-dd" days. */
export function dayPresets(now: Date | number = Date.now()): DayPreset[] {
  return followupPresets(new Date(now)).map((p) => ({ id: p.id, ...(PRESET_LABELS[p.id] ?? { label: p.label, short: p.label }), date: toISODate(p.date) }));
}

/* ------------------------------------------------------------------ */
/*  Due date + time                                                    */
/* ------------------------------------------------------------------ */

/** "07:00" for a digest hour (0–23). */
export function digestTime(hour: number | null | undefined): string {
  const h = Math.min(23, Math.max(0, Math.trunc(hour ?? 7)));
  return `${String(h).padStart(2, "0")}:00`;
}

/** Local date "yyyy-MM-dd" + "HH:mm" → ISO instant (device time zone). */
export function toDueAt(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, hh ?? 9, mm ?? 0, 0, 0).toISOString();
}

/** ISO instant → local "yyyy-MM-dd" and "HH:mm". */
export function fromDueAt(dueAt: string | Date): { date: string; time: string } {
  const d = new Date(dueAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/**
 * Live summary under the sheet title: "Tue, 21 Oct · every 3 months", "Tomorrow · 09:30".
 * `time` is shown only when it was picked explicitly (null = the digest default).
 */
export function followUpSummary(opts: { date: string | null; time: string | null; recurrence: Recurrence; recurrenceDays?: number | null; now?: Date | number }): string {
  const now = opts.now ?? Date.now();
  if (!opts.date) return "Pick a day";
  const [y, m, d] = opts.date.split("-").map(Number);
  const day = new Date(y!, (m ?? 1) - 1, d ?? 1);
  const today = startOfDay(new Date(now));
  const label = isSameDay(day, today) ? "Today" : isSameDay(day, addDays(today, 1)) ? "Tomorrow" : formatShortDate(day, now);
  return [label, opts.time, repeatLabel(opts.recurrence, opts.recurrenceDays)].filter(Boolean).join(" · ");
}

/** Due-date wording for rows: "Overdue · 3 days ago", "Today", "Tomorrow", "Tue, 21 Oct". */
export function dueLabel(dueAt: string | Date, now: number): { text: string; tone: "overdue" | "today" | "soon" | "later" } {
  const due = new Date(dueAt);
  const today = startOfDay(new Date(now));
  const dueDay = startOfDay(due);
  const days = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) {
    const n = -days;
    return { text: n === 1 ? "Yesterday" : n < 14 ? `${n} days overdue` : `Overdue since ${formatShortDate(due, now)}`, tone: "overdue" };
  }
  if (days === 0) return { text: "Today", tone: "today" };
  if (days === 1) return { text: "Tomorrow", tone: "soon" };
  return { text: formatShortDate(due, now), tone: days < 7 ? "soon" : "later" };
}
