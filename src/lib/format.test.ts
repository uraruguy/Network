import { describe, expect, it } from "vitest";
import { dateTimeFormat, formatDate, formatRelative, formatShortDate, formatterCacheSize, localTimeIn, relativeTimeFormat, toDate } from "./format";
import * as utils from "./utils";

describe("formatter cache", () => {
  it("returns the same instance for equal options regardless of key order", () => {
    const a = dateTimeFormat("en-GB", { day: "numeric", month: "short" });
    const b = dateTimeFormat("en-GB", { month: "short", day: "numeric" });
    expect(a).toBe(b);
    expect(dateTimeFormat("en-GB", { month: "short", day: "numeric", year: undefined })).toBe(a);
    expect(dateTimeFormat("en-GB", { month: "long", day: "numeric" })).not.toBe(a);
    expect(relativeTimeFormat("en", { numeric: "auto" })).toBe(relativeTimeFormat("en", { numeric: "auto" }));
  });
  it("does not grow when formatting many rows", () => {
    formatDate(new Date());
    const size = formatterCacheSize();
    for (let i = 0; i < 500; i++) {
      formatDate(new Date(2026, 0, 1 + i));
      formatRelative(new Date(Date.now() - i * 1000));
    }
    expect(formatterCacheSize()).toBeLessThanOrEqual(size + 1);
  });
});

describe("toDate", () => {
  it("reads yyyy-MM-dd as local midnight", () => {
    const d = toDate("2026-10-14")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 14, 0]);
  });
  it("handles nullish/invalid", () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
    expect(toDate("")).toBeNull();
    expect(toDate("not a date")).toBeNull();
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  it.each([
    [new Date("2026-10-17T11:59:30Z"), "30 seconds ago"],
    [new Date("2026-10-17T11:55:00Z"), "5 minutes ago"],
    [new Date("2026-10-17T09:00:00Z"), "3 hours ago"],
    [new Date("2026-10-16T12:00:00Z"), "yesterday"],
    [new Date("2026-10-20T12:00:00Z"), "in 3 days"],
    [new Date("2026-08-17T12:00:00Z"), "2 months ago"],
    [new Date("2024-10-17T12:00:00Z"), "2 years ago"],
  ])("%s → %s", (d, out) => {
    expect(formatRelative(d, now)).toBe(out);
  });
  it("accepts epoch ms for now and empty input", () => {
    expect(formatRelative(new Date("2026-10-17T11:00:00Z"), now.getTime())).toBe("1 hour ago");
    expect(formatRelative(null, now)).toBe("");
  });
});

describe("formatDate / formatShortDate", () => {
  it("formats en-GB", () => {
    expect(formatDate("2026-10-14")).toBe("14 Oct 2026");
    expect(formatDate("2026-10-14", { year: undefined })).toBe("14 Oct");
    expect(formatDate(null)).toBe("");
  });
  it("short date drops the current year", () => {
    expect(formatShortDate("2026-10-14", new Date(2026, 5, 1))).toBe("Wed, 14 Oct");
    expect(formatShortDate("2027-01-05", new Date(2026, 5, 1))).toBe("Tue, 5 Jan 2027");
  });
});

describe("localTimeIn", () => {
  it("formats wall time in a zone and tolerates bad zones", () => {
    const at = new Date("2026-10-17T12:00:00Z");
    expect(localTimeIn("Asia/Tokyo", at)).toBe("21:00");
    expect(localTimeIn("Not/AZone", at)).toBeNull();
    expect(localTimeIn(null, at)).toBeNull();
  });
});

describe("utils re-exports", () => {
  it("keeps the v1 import path working", () => {
    expect(utils.formatDate).toBe(formatDate);
    expect(utils.formatRelative).toBe(formatRelative);
    expect(utils.localTimeIn).toBe(localTimeIn);
  });
});
