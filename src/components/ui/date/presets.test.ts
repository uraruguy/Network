import { describe, expect, it } from "vitest";
import { clampDate, followupPresets, fromISODate, pastPresets, presetsFor, snapTime, timeOptions, toISODate } from "./presets";

const iso = (d: Date) => toISODate(d);
const byId = (list: { id: string; date: Date }[]) => Object.fromEntries(list.map((p) => [p.id, iso(p.date)]));

describe("ISO date helpers", () => {
  it("round-trips local calendar dates", () => {
    expect(toISODate(new Date(2026, 9, 14))).toBe("2026-10-14");
    expect(iso(fromISODate("2026-10-14")!)).toBe("2026-10-14");
    expect(fromISODate("2026-10-14")!.getHours()).toBe(0);
  });
  it("rejects empty and invalid input", () => {
    expect(fromISODate(null)).toBeNull();
    expect(fromISODate("")).toBeNull();
    expect(fromISODate("2026-13-40")).toBeNull();
    expect(fromISODate("nope")).toBeNull();
  });
});

describe("followupPresets", () => {
  it("on a weekday (Fri 16 Oct 2026, 15:30)", () => {
    const p = byId(followupPresets(new Date(2026, 9, 16, 15, 30)));
    expect(p).toEqual({
      tomorrow: "2026-10-17",
      // Saturday == tomorrow → deduped, keeps "Tomorrow"
      "next-week": "2026-10-19",
      "2-weeks": "2026-10-30",
      "1-month": "2026-11-16",
      "3-months": "2027-01-16",
      "6-months": "2027-04-16",
    });
  });

  it("this weekend is the coming Saturday mid-week (Tue 13 Oct)", () => {
    const list = followupPresets(new Date(2026, 9, 13));
    expect(list.map((x) => x.label)).toEqual(["Tomorrow", "This weekend", "Next week", "In 2 weeks", "In 1 month", "In 3 months", "In 6 months"]);
    expect(byId(list)["this-weekend"]).toBe("2026-10-17");
    expect(byId(list)["next-week"]).toBe("2026-10-19");
  });

  it("on Saturday it offers next weekend", () => {
    const p = byId(followupPresets(new Date(2026, 9, 17)));
    expect(p["next-weekend"]).toBe("2026-10-24");
    expect(p["this-weekend"]).toBeUndefined();
  });

  it("on Sunday, next week (Monday) collapses into tomorrow", () => {
    const list = followupPresets(new Date(2026, 9, 18));
    const p = byId(list);
    expect(p.tomorrow).toBe("2026-10-19");
    expect(p["next-week"]).toBeUndefined();
    expect(p["next-weekend"]).toBe("2026-10-24");
  });

  it("month arithmetic clamps to month end", () => {
    const p = byId(followupPresets(new Date(2026, 0, 31)));
    expect(p["1-month"]).toBe("2026-02-28");
  });

  it("dates are strictly increasing", () => {
    for (let d = 1; d <= 14; d++) {
      const list = followupPresets(new Date(2026, 9, d));
      for (let i = 1; i < list.length; i++) expect(list[i]!.date.getTime()).toBeGreaterThan(list[i - 1]!.date.getTime());
    }
  });
});

describe("pastPresets", () => {
  it("on a Wednesday (14 Oct 2026)", () => {
    expect(byId(pastPresets(new Date(2026, 9, 14, 8)))).toEqual({
      today: "2026-10-14",
      yesterday: "2026-10-13",
      "last-weekend": "2026-10-10",
      "last-week": "2026-10-07",
      "2-weeks-ago": "2026-09-30",
      "last-month": "2026-09-14",
      "3-months-ago": "2026-07-14",
    });
  });
  it("on Sunday, last weekend == yesterday is deduped", () => {
    const p = byId(pastPresets(new Date(2026, 9, 18)));
    expect(p.yesterday).toBe("2026-10-17");
    expect(p["last-weekend"]).toBeUndefined();
  });
  it("on Saturday, last weekend is a week ago", () => {
    expect(byId(pastPresets(new Date(2026, 9, 17)))["last-weekend"]).toBe("2026-10-10");
  });
});

describe("presetsFor", () => {
  const now = new Date(2026, 9, 14);
  it("returns nothing for 'none'", () => {
    expect(presetsFor("none", now)).toEqual([]);
  });
  it("honours min/max", () => {
    const list = presetsFor("followup", now, { max: new Date(2026, 10, 1) });
    expect(list.map((p) => p.id)).toEqual(["tomorrow", "this-weekend", "next-week", "2-weeks"]);
    const past = presetsFor("past", now, { min: new Date(2026, 9, 1) });
    expect(past.map((p) => p.id)).toEqual(["today", "yesterday", "last-weekend", "last-week"]);
  });
});

describe("clampDate", () => {
  it("clamps into range", () => {
    const min = new Date(2026, 0, 10);
    const max = new Date(2026, 0, 20);
    expect(iso(clampDate(new Date(2026, 0, 1), min, max))).toBe("2026-01-10");
    expect(iso(clampDate(new Date(2026, 0, 25), min, max))).toBe("2026-01-20");
    expect(iso(clampDate(new Date(2026, 0, 15), min, max))).toBe("2026-01-15");
  });
});

describe("time helpers", () => {
  it("lists 96 quarter hours", () => {
    const t = timeOptions();
    expect(t).toHaveLength(96);
    expect(t[0]).toBe("00:00");
    expect(t[37]).toBe("09:15");
    expect(t.at(-1)).toBe("23:45");
  });
  it("snaps to the nearest step", () => {
    expect(snapTime("09:07")).toBe("09:00");
    expect(snapTime("09:08")).toBe("09:15");
    expect(snapTime("23:59")).toBe("23:45");
    expect(snapTime("garbage")).toBe("09:00");
  });
});
