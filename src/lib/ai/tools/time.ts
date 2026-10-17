/**
 * Wall-clock ⇄ instant conversion in an IANA time zone, without a date library. Pure; tested.
 * Follow-ups land at 09:00 local time, like the rest of the app.
 */

const DEFAULT_HOUR = 9;

/** Offset (minutes east of UTC) of `timeZone` at instant `at`. */
export function zoneOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** The instant when the wall clock in `timeZone` shows y-m-d h:min. */
export function zonedToUtc(y: number, m: number, d: number, h: number, min: number, timeZone: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, min);
  // Two passes settle DST transitions (the offset at the guess may differ from the offset at the answer).
  let ts = guess - zoneOffsetMinutes(new Date(guess), timeZone) * 60_000;
  ts = guess - zoneOffsetMinutes(new Date(ts), timeZone) * 60_000;
  return new Date(ts);
}

/** Today's calendar date in `timeZone` as [year, month, day]. */
export function todayIn(timeZone: string, now = new Date()): [number, number, number] {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = s.split("-").map(Number);
  return [y!, m!, d!];
}

/**
 * Resolves a follow-up due time: an ISO date-time is taken as is; a bare date (YYYY-MM-DD) or
 * `inDays` from today means 09:00 that day in the owner's zone. Returns null for unparseable input.
 */
export function resolveDue(opts: { dueAt?: string; inDays?: number }, timeZone: string, now = new Date()): Date | null {
  if (opts.dueAt) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(opts.dueAt.trim());
    if (m) return zonedToUtc(Number(m[1]), Number(m[2]), Number(m[3]), DEFAULT_HOUR, 0, timeZone);
    const d = new Date(opts.dueAt);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (opts.inDays !== undefined) {
    const [y, mo, d] = todayIn(timeZone, now);
    const target = new Date(Date.UTC(y, mo - 1, d + opts.inDays));
    return zonedToUtc(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate(), DEFAULT_HOUR, 0, timeZone);
  }
  return null;
}
