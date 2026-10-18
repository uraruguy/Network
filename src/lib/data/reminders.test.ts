import { describe, expect, it } from "vitest";
import { addMonthsClamped, nextDue, snoozeUntil } from "./reminders";

const LJ = "Europe/Ljubljana";
const LA = "America/Los_Angeles";

describe("addMonthsClamped", () => {
  it("clamps to the last day of shorter months", () => {
    expect(addMonthsClamped("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsClamped("2026-08-31", 1)).toBe("2026-09-30");
    expect(addMonthsClamped("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonthsClamped("2028-02-29", 12)).toBe("2029-02-28");
  });

  it("rolls over years and keeps ordinary days", () => {
    expect(addMonthsClamped("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonthsClamped("2026-10-18", 6)).toBe("2027-04-18");
    expect(addMonthsClamped("2026-03-10", -3)).toBe("2025-12-10");
  });
});

describe("nextDue", () => {
  it("counts from the owner's calendar date, not UTC's", () => {
    // 23:30 UTC on 31 Jan is already 1 Feb in Ljubljana → next month is 1 Mar, not 28 Feb.
    const from = new Date("2027-01-31T23:30:00Z");
    expect(nextDue(from, "monthly", null, LJ, new Date("2027-01-15T08:00:00Z"))?.toISOString()).toBe("2027-03-01T08:00:00.000Z");
    // …while in Los Angeles it's still 31 Jan → 28 Feb (clamped), not 3 Mar.
    expect(nextDue(from, "monthly", null, LA, new Date("2027-01-15T17:00:00Z"))?.toISOString()).toBe("2027-02-28T17:00:00.000Z");
  });

  it("keeps the reminder's local time of day across DST", () => {
    // 09:00 in Ljubljana in winter (08:00Z) → 09:00 in summer (07:00Z).
    const due = new Date("2027-03-01T08:00:00Z");
    expect(nextDue(new Date("2027-03-02T12:00:00Z"), "monthly", null, LJ, due)?.toISOString()).toBe("2027-04-02T07:00:00.000Z");
  });

  it("handles every repeat", () => {
    const from = new Date("2026-10-18T10:00:00Z");
    const at9 = new Date("2026-10-01T07:00:00Z");
    expect(nextDue(from, "quarterly", null, LJ, at9)?.toISOString()).toBe("2027-01-18T08:00:00.000Z");
    expect(nextDue(from, "semiannual", null, LJ, at9)?.toISOString()).toBe("2027-04-18T07:00:00.000Z");
    expect(nextDue(from, "yearly", null, LJ, at9)?.toISOString()).toBe("2027-10-18T07:00:00.000Z");
    expect(nextDue(from, "custom_days", 10, LJ, at9)?.toISOString()).toBe("2026-10-28T08:00:00.000Z");
    expect(nextDue(from, "custom_days", null, LJ, at9)?.toISOString()).toBe("2026-11-17T08:00:00.000Z");
    expect(nextDue(from, "none", null, LJ)).toBeNull();
  });

  it("survives a broken time zone (falls back to UTC)", () => {
    expect(nextDue(new Date("2026-10-18T10:00:00Z"), "monthly", null, "Not/AZone")?.toISOString()).toBe("2026-11-18T10:00:00.000Z");
  });
});

describe("snoozeUntil", () => {
  it("lands at 09:00 local, counting days from the owner's today", () => {
    // 22:30 UTC on 17 Oct is 00:30 on 18 Oct in Ljubljana: a week later is 25 Oct (the DST change).
    expect(snoozeUntil(7, LJ, new Date("2026-10-17T22:30:00Z")).toISOString()).toBe("2026-10-25T08:00:00.000Z");
    expect(snoozeUntil(1, LA, new Date("2026-10-18T03:00:00Z")).toISOString()).toBe("2026-10-18T16:00:00.000Z");
  });

  it("falls back to UTC for an unknown zone", () => {
    expect(snoozeUntil(1, "", new Date("2026-10-18T10:00:00Z")).toISOString()).toBe("2026-10-19T09:00:00.000Z");
  });
});
