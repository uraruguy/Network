import { describe, expect, it } from "vitest";
import { resolveDue, todayIn, zonedToUtc, zoneOffsetMinutes } from "./time";

describe("zoned time", () => {
  it("knows DST offsets", () => {
    expect(zoneOffsetMinutes(new Date("2026-07-01T12:00:00Z"), "Europe/Ljubljana")).toBe(120);
    expect(zoneOffsetMinutes(new Date("2026-12-01T12:00:00Z"), "Europe/Ljubljana")).toBe(60);
    expect(zoneOffsetMinutes(new Date("2026-12-01T12:00:00Z"), "America/Los_Angeles")).toBe(-480);
  });

  it("converts local wall-clock time to UTC", () => {
    expect(zonedToUtc(2026, 11, 3, 9, 0, "Europe/Ljubljana").toISOString()).toBe("2026-11-03T08:00:00.000Z");
    expect(zonedToUtc(2026, 7, 3, 9, 0, "Europe/Ljubljana").toISOString()).toBe("2026-07-03T07:00:00.000Z");
    expect(zonedToUtc(2026, 7, 3, 9, 0, "America/Los_Angeles").toISOString()).toBe("2026-07-03T16:00:00.000Z");
  });

  it("finds today in a zone", () => {
    // 23:30 UTC on Oct 17 is already Oct 18 in Ljubljana.
    expect(todayIn("Europe/Ljubljana", new Date("2026-10-17T23:30:00Z"))).toEqual([2026, 10, 18]);
  });
});

describe("resolveDue", () => {
  const now = new Date("2026-10-17T10:00:00Z");

  it("puts bare dates at 09:00 local", () => {
    expect(resolveDue({ dueAt: "2026-11-03" }, "Europe/Ljubljana", now)?.toISOString()).toBe("2026-11-03T08:00:00.000Z");
  });

  it("keeps explicit date-times", () => {
    expect(resolveDue({ dueAt: "2026-11-03T15:30:00+01:00" }, "Europe/Ljubljana", now)?.toISOString()).toBe("2026-11-03T14:30:00.000Z");
  });

  it("counts inDays from today in the owner's zone, across month ends", () => {
    expect(resolveDue({ inDays: 0 }, "Europe/Ljubljana", now)?.toISOString()).toBe("2026-10-17T07:00:00.000Z");
    expect(resolveDue({ inDays: 20 }, "Europe/Ljubljana", now)?.toISOString()).toBe("2026-11-06T08:00:00.000Z");
  });

  it("rejects garbage", () => {
    expect(resolveDue({ dueAt: "next tuesday" }, "Europe/Ljubljana", now)).toBeNull();
    expect(resolveDue({}, "Europe/Ljubljana", now)).toBeNull();
  });
});
