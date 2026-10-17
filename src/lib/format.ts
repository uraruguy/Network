/**
 * Date/time formatting with module-level cached Intl formatters.
 * Constructing an Intl.DateTimeFormat costs ~10–50µs; long lists used to build one per row.
 */

export type DateInput = Date | string | number | null | undefined;

const dtfCache = new Map<string, Intl.DateTimeFormat>();
const rtfCache = new Map<string, Intl.RelativeTimeFormat>();

/** Stable key for an options object (sorted, undefined dropped). */
function optionsKey(opts: object): string {
  return Object.entries(opts)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join("&");
}

/** Cached `Intl.DateTimeFormat`. Keyed by locale + options (incl. `timeZone`). */
export function dateTimeFormat(locale: string, opts: Intl.DateTimeFormatOptions = {}): Intl.DateTimeFormat {
  const key = `${locale}|${optionsKey(opts)}`;
  let f = dtfCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    dtfCache.set(key, f);
  }
  return f;
}

/** Cached `Intl.RelativeTimeFormat`. */
export function relativeTimeFormat(locale = "en", opts: Intl.RelativeTimeFormatOptions = { numeric: "auto" }): Intl.RelativeTimeFormat {
  const key = `${locale}|${optionsKey(opts)}`;
  let f = rtfCache.get(key);
  if (!f) {
    f = new Intl.RelativeTimeFormat(locale, opts);
    rtfCache.set(key, f);
  }
  return f;
}

/** Number of cached formatters (for tests / diagnostics). */
export function formatterCacheSize() {
  return dtfCache.size + rtfCache.size;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Normalises input to a Date. Date-only strings (`yyyy-MM-dd`, e.g. birthdays, due dates) are
 * read as LOCAL midnight — `new Date("2026-10-14")` would be UTC and show the previous day
 * west of Greenwich.
 */
export function toDate(input: DateInput): Date | null {
  if (input === null || input === undefined || input === "") return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  if (typeof input === "string") {
    const m = DATE_ONLY.exec(input);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "5 minutes ago", "yesterday", "in 3 days", "last month". */
export function formatRelative(date: DateInput, now: Date | number = new Date()) {
  const d = toDate(date);
  if (!d) return "";
  const nowMs = typeof now === "number" ? now : now.getTime();
  const diff = (nowMs - d.getTime()) / 1000;
  const abs = Math.abs(diff);
  const rtf = relativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return rtf.format(-Math.round(diff), "second");
  if (abs < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(-Math.round(diff / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(-Math.round(diff / (86400 * 30)), "month");
  return rtf.format(-Math.round(diff / (86400 * 365)), "year");
}

/** "14 Oct 2026" by default; pass Intl options to override (e.g. `{ year: undefined }`). */
export function formatDate(date: DateInput, opts?: Intl.DateTimeFormatOptions) {
  const d = toDate(date);
  if (!d) return "";
  return dateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", ...opts }).format(d);
}

/** "Tue, 14 Oct" — adds the year only when it isn't the current one. */
export function formatShortDate(date: DateInput, now: Date | number = new Date()) {
  const d = toDate(date);
  if (!d) return "";
  const parts = dateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  const thisYear = new Date(now).getFullYear() === d.getFullYear();
  // Assembled by hand: ICU versions disagree on the comma after the weekday.
  return `${get("weekday")}, ${get("day")} ${get("month")}${thisYear ? "" : ` ${get("year")}`}`;
}

/** "09:30" (24h, en-GB). */
export function formatTime(date: DateInput, timeZone?: string) {
  const d = toDate(date);
  if (!d) return "";
  return dateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(d);
}

/** Wall-clock time in another time zone, e.g. a contact's city. Null for invalid zones. */
export function localTimeIn(timeZone: string | null | undefined, now: Date | number = new Date()) {
  if (!timeZone) return null;
  try {
    return dateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(now);
  } catch {
    return null;
  }
}
