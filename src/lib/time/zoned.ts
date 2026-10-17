/**
 * Time-zone math on plain `Intl` (no dependencies), DST-safe. Dates are ISO calendar strings
 * ("2026-10-25"); instants are `Date`s. All functions are pure.
 *
 *   localDate(now, "Europe/Ljubljana")            → "2026-10-25"
 *   localDayBounds("2026-10-25", "Europe/Ljubljana") → { start: 22:00Z the day before, end: 23:00Z } (a 25-hour day)
 *
 * The database does the same with `(:date::date)::timestamp at time zone :tz`; these helpers are
 * for code that must agree with it (digest scheduling, "next digest at …" labels, tests).
 */

export type ISODate = string;

const DTF = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let f = DTF.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    DTF.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** A time zone that is safe to pass to Intl/SQL: `tz` if valid, else UTC. */
export function safeTimeZone(timeZone: string | null | undefined): string {
  return isValidTimeZone(timeZone) ? timeZone : "UTC";
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

/** Wall-clock components of `instant` in `timeZone`. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(instant)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday!] ?? 0,
  };
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function toISODate(year: number, month: number, day: number): ISODate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function parseISODate(date: ISODate): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** The calendar date of `instant` in `timeZone`. */
export function localDate(instant: Date, timeZone: string): ISODate {
  const p = zonedParts(instant, timeZone);
  return toISODate(p.year, p.month, p.day);
}

/** The hour (0–23) of `instant` in `timeZone`. */
export function localHour(instant: Date, timeZone: string): number {
  return zonedParts(instant, timeZone).hour;
}

/** UTC offset of `timeZone` at `instant`, in minutes (Ljubljana in summer: +120). */
export function tzOffsetMinutes(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/**
 * The instant at which the wall clock in `timeZone` shows `date` `hour:minute`.
 * Ambiguous times (clocks going back) resolve to the earlier instant; times that don't exist
 * (clocks going forward) move forward by the gap — like most calendar apps.
 */
export function zonedTimeToUtc(date: ISODate, hour: number, minute: number, timeZone: string): Date {
  const { year, month, day } = parseISODate(date);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const before = tzOffsetMinutes(new Date(wall - 12 * 3_600_000), timeZone);
  const after = tzOffsetMinutes(new Date(wall + 12 * 3_600_000), timeZone);
  const valid = [...new Set([before, after])]
    .map((offset) => wall - offset * 60_000)
    .filter((t) => {
      const p = zonedParts(new Date(t), timeZone);
      return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) === wall;
    })
    .sort((a, b) => a - b);
  return new Date(valid[0] ?? wall - before * 60_000);
}

/** `date` ± `days` (calendar arithmetic, no time zones involved). */
export function addDays(date: ISODate, days: number): ISODate {
  const { year, month, day } = parseISODate(date);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return toISODate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: ISODate, b: ISODate): number {
  const pa = parseISODate(a);
  const pb = parseISODate(b);
  return Math.round((Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / 86_400_000);
}

/** Start (inclusive) and end (exclusive) instants of the local day `date` — 23 or 25 hours long on DST days. */
export function localDayBounds(date: ISODate, timeZone: string): { start: Date; end: Date } {
  return { start: zonedTimeToUtc(date, 0, 0, timeZone), end: zonedTimeToUtc(addDays(date, 1), 0, 0, timeZone) };
}

/** The next instant (≥ now) at which the local clock in `timeZone` reads `hour`:00. */
export function nextLocalHour(now: Date, timeZone: string, hour: number): Date {
  const today = localDate(now, timeZone);
  const candidate = zonedTimeToUtc(today, hour, 0, timeZone);
  return candidate.getTime() >= now.getTime() ? candidate : zonedTimeToUtc(addDays(today, 1), hour, 0, timeZone);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
