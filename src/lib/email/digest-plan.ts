/**
 * Pure decisions behind the daily digest — when to send, which birthdays to include — kept apart
 * from the database so they can be unit-tested.
 */
import { daysBetween, isLeapYear, localDate, localHour, parseISODate, safeTimeZone, toISODate, type ISODate } from "@/lib/time/zoned";

/** Sentinel year for "year unknown" birthdays (Apple Contacts' convention; see ui/date/BirthdayPicker). */
export const NO_YEAR = 1604;

export type DigestProfile = { digestEnabled: boolean; digestHour: number; lastDigestOn: string | null; timezone: string };

export type DigestDecision =
  | { send: true; today: ISODate; timeZone: string }
  | { send: false; today: ISODate; timeZone: string; reason: "disabled" | "before_hour" | "already_sent" };

/**
 * Whether a profile is due its digest at `now`: enabled, at/after the digest hour in the profile's
 * time zone, and not already sent today (`last_digest_on`). `force` skips all three checks.
 */
export function digestDecision(p: DigestProfile, now: Date, opts: { force?: boolean } = {}): DigestDecision {
  const timeZone = safeTimeZone(p.timezone);
  const today = localDate(now, timeZone);
  if (opts.force) return { send: true, today, timeZone };
  if (!p.digestEnabled) return { send: false, today, timeZone, reason: "disabled" };
  if (localHour(now, timeZone) < p.digestHour) return { send: false, today, timeZone, reason: "before_hour" };
  if (p.lastDigestOn === today) return { send: false, today, timeZone, reason: "already_sent" };
  return { send: true, today, timeZone };
}

export const DECISION_LABEL: Record<Exclude<DigestDecision, { send: true }>["reason"], string> = {
  disabled: "disabled",
  before_hour: "before the digest hour",
  already_sent: "already sent today",
};

export type UpcomingBirthday = { date: ISODate; inDays: number; /** Age they turn, when the birth year is known. */ turning: number | null };

/**
 * The next occurrence of a birthday on or after `today`. A 29 February birthday is celebrated on
 * 28 February in common years. The 1604 sentinel year means "year unknown" (no age).
 */
export function nextBirthday(birthday: string, today: ISODate): UpcomingBirthday | null {
  let b: { year: number; month: number; day: number };
  try {
    b = parseISODate(birthday.slice(0, 10));
  } catch {
    return null;
  }
  if (b.month < 1 || b.month > 12 || b.day < 1 || b.day > 31) return null;
  const t = parseISODate(today);
  const occurrence = (year: number) => toISODate(year, b.month, b.month === 2 && b.day === 29 && !isLeapYear(year) ? 28 : b.day);
  let year = t.year;
  let date = occurrence(year);
  if (daysBetween(today, date) < 0) date = occurrence(++year);
  const known = b.year !== NO_YEAR && b.year > 0 && b.year <= t.year;
  return { date, inDays: daysBetween(today, date), turning: known ? year - b.year : null };
}

/** Birthdays within `windowDays` of `today` (inclusive), soonest first. */
export function upcomingBirthdays<T extends { birthday: string | null }>(rows: T[], today: ISODate, windowDays = 7): (T & UpcomingBirthday & { birthday: string })[] {
  const out: (T & UpcomingBirthday & { birthday: string })[] = [];
  for (const row of rows) {
    if (!row.birthday) continue;
    const next = nextBirthday(row.birthday, today);
    if (next && next.inDays <= windowDays) out.push({ ...row, birthday: row.birthday, ...next });
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}

/** A digest is worth sending only when something is due, overdue, or a birthday is coming up. */
export function hasDigestContent(c: { due: unknown[]; overdue: unknown[]; birthdays: unknown[] }): boolean {
  return c.due.length + c.overdue.length + c.birthdays.length > 0;
}
