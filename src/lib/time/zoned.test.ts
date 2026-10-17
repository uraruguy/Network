import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isValidTimeZone, localDate, localDayBounds, localHour, nextLocalHour, safeTimeZone, tzOffsetMinutes, zonedTimeToUtc } from "./zoned";

const LJ = "Europe/Ljubljana";
const LA = "America/Los_Angeles";
const iso = (d: Date) => d.toISOString();
const hours = (b: { start: Date; end: Date }) => (b.end.getTime() - b.start.getTime()) / 3_600_000;

describe("zoned time — Europe/Ljubljana", () => {
  it("knows the offsets either side of DST", () => {
    expect(tzOffsetMinutes(new Date("2026-01-15T12:00:00Z"), LJ)).toBe(60);
    expect(tzOffsetMinutes(new Date("2026-07-15T12:00:00Z"), LJ)).toBe(120);
  });

  it("spring forward (29 Mar 2026) is a 23-hour day", () => {
    const b = localDayBounds("2026-03-29", LJ);
    expect(iso(b.start)).toBe("2026-03-28T23:00:00.000Z");
    expect(iso(b.end)).toBe("2026-03-29T22:00:00.000Z");
    expect(hours(b)).toBe(23);
  });

  it("fall back (25 Oct 2026) is a 25-hour day", () => {
    const b = localDayBounds("2026-10-25", LJ);
    expect(iso(b.start)).toBe("2026-10-24T22:00:00.000Z");
    expect(iso(b.end)).toBe("2026-10-25T23:00:00.000Z");
    expect(hours(b)).toBe(25);
  });

  it("maps instants near midnight to the right local date and hour", () => {
    expect(localDate(new Date("2026-03-29T22:30:00Z"), LJ)).toBe("2026-03-30"); // 00:30 CEST
    expect(localDate(new Date("2026-03-28T22:59:59Z"), LJ)).toBe("2026-03-28"); // 23:59:59 CET
    expect(localHour(new Date("2026-10-25T00:30:00Z"), LJ)).toBe(2); // 02:30 CEST (first pass)
    expect(localHour(new Date("2026-10-25T01:30:00Z"), LJ)).toBe(2); // 02:30 CET (second pass)
  });

  it("resolves a skipped time forward and a repeated time to the earlier instant", () => {
    expect(iso(zonedTimeToUtc("2026-03-29", 2, 30, LJ))).toBe("2026-03-29T01:30:00.000Z"); // → 03:30 CEST
    expect(iso(zonedTimeToUtc("2026-10-25", 2, 30, LJ))).toBe("2026-10-25T00:30:00.000Z"); // 02:30 CEST
    expect(iso(zonedTimeToUtc("2026-10-25", 7, 0, LJ))).toBe("2026-10-25T06:00:00.000Z"); // 07:00 CET
  });

  it("finds the next digest hour across the DST change", () => {
    // 24 Oct 2026, 08:00 CEST — 07:00 already passed, next is 25 Oct 07:00 CET.
    expect(iso(nextLocalHour(new Date("2026-10-24T06:00:00Z"), LJ, 7))).toBe("2026-10-25T06:00:00.000Z");
    expect(iso(nextLocalHour(new Date("2026-10-24T04:00:00Z"), LJ, 7))).toBe("2026-10-24T05:00:00.000Z");
  });
});

describe("zoned time — America/Los_Angeles", () => {
  it("spring forward (8 Mar 2026) is a 23-hour day", () => {
    const b = localDayBounds("2026-03-08", LA);
    expect(iso(b.start)).toBe("2026-03-08T08:00:00.000Z");
    expect(iso(b.end)).toBe("2026-03-09T07:00:00.000Z");
    expect(hours(b)).toBe(23);
  });

  it("fall back (1 Nov 2026) is a 25-hour day", () => {
    const b = localDayBounds("2026-11-01", LA);
    expect(iso(b.start)).toBe("2026-11-01T07:00:00.000Z");
    expect(iso(b.end)).toBe("2026-11-02T08:00:00.000Z");
    expect(hours(b)).toBe(25);
  });

  it("is a day behind UTC in the evening", () => {
    expect(localDate(new Date("2026-11-02T05:00:00Z"), LA)).toBe("2026-11-01"); // 21:00 PST
    expect(tzOffsetMinutes(new Date("2026-11-02T05:00:00Z"), LA)).toBe(-480);
    expect(tzOffsetMinutes(new Date("2026-07-01T05:00:00Z"), LA)).toBe(-420);
    expect(iso(zonedTimeToUtc("2026-03-08", 2, 15, LA))).toBe("2026-03-08T10:15:00.000Z"); // skipped → 03:15 PDT
  });
});

describe("calendar arithmetic", () => {
  it("adds days across months, years and leap days", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts days between dates regardless of DST", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-30", "2026-10-24")).toBe(-6);
    expect(daysBetween("2026-12-25", "2027-01-01")).toBe(7);
  });

  it("validates time zones", () => {
    expect(isValidTimeZone(LJ)).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(safeTimeZone("nope")).toBe("UTC");
  });
});
