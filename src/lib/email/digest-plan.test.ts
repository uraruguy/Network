import { describe, expect, it } from "vitest";
import { digestDecision, hasDigestContent, nextBirthday, upcomingBirthdays } from "./digest-plan";

const profile = { digestEnabled: true, digestHour: 7, lastDigestOn: null as string | null, timezone: "Europe/Ljubljana" };

describe("digestDecision (window + dedupe)", () => {
  it("waits for the digest hour in the profile's time zone", () => {
    // 05:30Z = 06:30 CET → before 07:00.
    expect(digestDecision(profile, new Date("2026-01-15T05:30:00Z"))).toMatchObject({ send: false, reason: "before_hour", today: "2026-01-15" });
    expect(digestDecision(profile, new Date("2026-01-15T06:00:00Z"))).toMatchObject({ send: true, today: "2026-01-15" });
    // Summer: 07:00 CEST is 05:00Z.
    expect(digestDecision(profile, new Date("2026-07-15T05:00:00Z"))).toMatchObject({ send: true, today: "2026-07-15" });
  });

  it("sends at most once per local day (last_digest_on), also on birthday-only days", () => {
    const sentToday = { ...profile, lastDigestOn: "2026-01-15" };
    for (const hour of ["06:00", "09:00", "15:00", "22:59"]) {
      expect(digestDecision(sentToday, new Date(`2026-01-15T${hour}:00Z`))).toMatchObject({ send: false, reason: "already_sent" });
    }
    // The next local day is due again — even though it's still the 15th in UTC.
    expect(digestDecision(sentToday, new Date("2026-01-15T23:30:00Z"))).toMatchObject({ send: false, reason: "before_hour", today: "2026-01-16" });
    expect(digestDecision(sentToday, new Date("2026-01-16T06:00:00Z"))).toMatchObject({ send: true, today: "2026-01-16" });
  });

  it("uses the local date west of UTC", () => {
    const la = { ...profile, timezone: "America/Los_Angeles", lastDigestOn: "2026-11-01" };
    // 2 Nov 05:00Z is still 1 Nov 21:00 in LA → already sent.
    expect(digestDecision(la, new Date("2026-11-02T05:00:00Z"))).toMatchObject({ send: false, reason: "already_sent", today: "2026-11-01" });
  });

  it("respects disabled, but force skips every check", () => {
    const off = { ...profile, digestEnabled: false, lastDigestOn: "2026-01-15" };
    expect(digestDecision(off, new Date("2026-01-15T12:00:00Z"))).toMatchObject({ send: false, reason: "disabled" });
    expect(digestDecision(off, new Date("2026-01-15T01:00:00Z"), { force: true })).toMatchObject({ send: true });
  });

  it("falls back to UTC for an invalid time zone", () => {
    expect(digestDecision({ ...profile, timezone: "Nowhere/Land" }, new Date("2026-01-15T07:00:00Z"))).toMatchObject({ send: true, timeZone: "UTC" });
  });
});

describe("birthdays", () => {
  it("computes days until the next occurrence and the age when the year is known", () => {
    expect(nextBirthday("1990-10-20", "2026-10-18")).toEqual({ date: "2026-10-20", inDays: 2, turning: 36 });
    expect(nextBirthday("1990-10-18", "2026-10-18")).toEqual({ date: "2026-10-18", inDays: 0, turning: 36 });
    expect(nextBirthday("1990-10-17", "2026-10-18")).toMatchObject({ date: "2027-10-17", turning: 37 });
  });

  it("treats 1604 as an unknown year (no age)", () => {
    expect(nextBirthday("1604-10-19", "2026-10-18")).toEqual({ date: "2026-10-19", inDays: 1, turning: null });
  });

  it("wraps around the new year", () => {
    expect(nextBirthday("1604-01-02", "2026-12-30")).toEqual({ date: "2027-01-02", inDays: 3, turning: null });
  });

  it("celebrates 29 February on the 28th in common years", () => {
    expect(nextBirthday("2000-02-29", "2027-02-20")).toEqual({ date: "2027-02-28", inDays: 8, turning: 27 });
    expect(nextBirthday("1604-02-29", "2028-02-27")).toEqual({ date: "2028-02-29", inDays: 2, turning: null });
  });

  it("keeps a 7-day window, soonest first, and skips bad data", () => {
    const rows = [
      { id: "a", birthday: "1604-10-25" }, // in 7 days → included
      { id: "b", birthday: "1985-10-19" }, // tomorrow
      { id: "c", birthday: "1604-10-26" }, // in 8 days → excluded
      { id: "d", birthday: null },
      { id: "e", birthday: "not-a-date" },
    ];
    expect(upcomingBirthdays(rows, "2026-10-18").map((r) => [r.id, r.inDays])).toEqual([
      ["b", 1],
      ["a", 7],
    ]);
  });

  it("a birthday alone is enough content to send", () => {
    expect(hasDigestContent({ due: [], overdue: [], birthdays: [{}] })).toBe(true);
    expect(hasDigestContent({ due: [], overdue: [], birthdays: [] })).toBe(false);
  });
});
