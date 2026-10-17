import { describe, expect, it } from "vitest";
import {
  dayPresets,
  digestTime,
  dueLabel,
  followUpSummary,
  fromDueAt,
  fromRecurrence,
  nextOccurrence,
  NO_REPEAT,
  repeatLabel,
  toDueAt,
  toRecurrence,
  type RepeatValue,
} from "./recurrence";

const custom = (every: number, unit: RepeatValue["unit"]): RepeatValue => ({ preset: "custom", every, unit });

describe("toRecurrence", () => {
  it("passes named presets through", () => {
    expect(toRecurrence({ ...NO_REPEAT, preset: "none" })).toEqual({ recurrence: "none", recurrenceDays: null });
    expect(toRecurrence({ ...NO_REPEAT, preset: "quarterly" })).toEqual({ recurrence: "quarterly", recurrenceDays: null });
    expect(toRecurrence({ ...NO_REPEAT, preset: "semiannual" })).toEqual({ recurrence: "semiannual", recurrenceDays: null });
  });

  it("maps custom days and weeks onto custom_days", () => {
    expect(toRecurrence(custom(10, "days"))).toEqual({ recurrence: "custom_days", recurrenceDays: 10 });
    expect(toRecurrence(custom(2, "weeks"))).toEqual({ recurrence: "custom_days", recurrenceDays: 14 });
  });

  it("uses exact calendar months when a custom month count has a named preset", () => {
    expect(toRecurrence(custom(1, "months"))).toEqual({ recurrence: "monthly", recurrenceDays: null });
    expect(toRecurrence(custom(3, "months"))).toEqual({ recurrence: "quarterly", recurrenceDays: null });
    expect(toRecurrence(custom(6, "months"))).toEqual({ recurrence: "semiannual", recurrenceDays: null });
    expect(toRecurrence(custom(12, "months"))).toEqual({ recurrence: "yearly", recurrenceDays: null });
    expect(toRecurrence(custom(2, "months"))).toEqual({ recurrence: "custom_days", recurrenceDays: 60 });
  });

  it("clamps nonsense counts", () => {
    expect(toRecurrence(custom(0, "days"))).toEqual({ recurrence: "custom_days", recurrenceDays: 1 });
    expect(toRecurrence(custom(2.4, "weeks"))).toEqual({ recurrence: "custom_days", recurrenceDays: 14 });
    expect(toRecurrence(custom(999, "months")).recurrenceDays).toBe(3650);
  });
});

describe("fromRecurrence", () => {
  it("round-trips named presets", () => {
    for (const r of ["none", "monthly", "quarterly", "semiannual", "yearly"] as const) expect(toRecurrence(fromRecurrence(r, null)).recurrence).toBe(r);
  });

  it("picks the largest unit that divides custom_days evenly", () => {
    expect(fromRecurrence("custom_days", 60)).toEqual(custom(2, "months"));
    expect(fromRecurrence("custom_days", 21)).toEqual(custom(3, "weeks"));
    expect(fromRecurrence("custom_days", 10)).toEqual(custom(10, "days"));
    expect(fromRecurrence("custom_days", null)).toEqual(custom(1, "months"));
  });

  it("round-trips custom values through the API shape", () => {
    for (const v of [custom(5, "days"), custom(2, "weeks"), custom(2, "months")]) {
      const { recurrence, recurrenceDays } = toRecurrence(v);
      expect(fromRecurrence(recurrence, recurrenceDays)).toEqual(v);
    }
  });
});

describe("repeatLabel", () => {
  it("reads naturally", () => {
    expect(repeatLabel("none")).toBeNull();
    expect(repeatLabel("monthly")).toBe("every month");
    expect(repeatLabel("quarterly")).toBe("every 3 months");
    expect(repeatLabel("semiannual")).toBe("every 6 months");
    expect(repeatLabel("yearly")).toBe("every year");
    expect(repeatLabel("custom_days", 14)).toBe("every 2 weeks");
    expect(repeatLabel("custom_days", 7)).toBe("every week");
    expect(repeatLabel("custom_days", 1)).toBe("every day");
    expect(repeatLabel("custom_days", 10)).toBe("every 10 days");
    expect(repeatLabel("custom_days", 90)).toBe("every 3 months");
  });
});

describe("followUpSummary", () => {
  const now = new Date(2026, 9, 14, 10, 0); // Wed 14 Oct 2026

  it("asks for a day until one is picked", () => {
    expect(followUpSummary({ date: null, time: null, recurrence: "none", now })).toBe("Pick a day");
  });

  it("formats date, explicit time and repeat", () => {
    expect(followUpSummary({ date: "2026-10-20", time: null, recurrence: "quarterly", now })).toBe("Tue, 20 Oct · every 3 months");
    expect(followUpSummary({ date: "2026-10-20", time: "09:30", recurrence: "none", now })).toBe("Tue, 20 Oct · 09:30");
    expect(followUpSummary({ date: "2026-10-20", time: "18:00", recurrence: "custom_days", recurrenceDays: 14, now })).toBe("Tue, 20 Oct · 18:00 · every 2 weeks");
  });

  it("says Today / Tomorrow and adds the year when it differs", () => {
    expect(followUpSummary({ date: "2026-10-14", time: null, recurrence: "none", now })).toBe("Today");
    expect(followUpSummary({ date: "2026-10-15", time: null, recurrence: "yearly", now })).toBe("Tomorrow · every year");
    expect(followUpSummary({ date: "2027-01-14", time: null, recurrence: "none", now })).toBe("Thu, 14 Jan 2027");
  });
});

describe("due dates", () => {
  it("digestTime pads and clamps the hour", () => {
    expect(digestTime(7)).toBe("07:00");
    expect(digestTime(18)).toBe("18:00");
    expect(digestTime(null)).toBe("07:00");
    expect(digestTime(30)).toBe("23:00");
  });

  it("toDueAt / fromDueAt round-trip in the device time zone", () => {
    const iso = toDueAt("2026-10-20", "07:30");
    expect(new Date(iso).getHours()).toBe(7);
    expect(fromDueAt(iso)).toEqual({ date: "2026-10-20", time: "07:30" });
  });

  it("nextOccurrence mirrors the server's nextDue", () => {
    const from = new Date(2026, 0, 31, 9, 0);
    expect(nextOccurrence(from, "none", null)).toBeNull();
    expect(nextOccurrence(from, "monthly", null)!.getMonth()).toBe(1);
    expect(nextOccurrence(from, "quarterly", null)!.getMonth()).toBe(3);
    expect(nextOccurrence(from, "yearly", null)!.getFullYear()).toBe(2027);
    expect(nextOccurrence(from, "custom_days", 10)!.getDate()).toBe(10);
  });

  it("dueLabel speaks in days with a tone", () => {
    const now = new Date(2026, 9, 14, 12, 0).getTime();
    expect(dueLabel(new Date(2026, 9, 14, 7, 0), now)).toEqual({ text: "Today", tone: "today" });
    expect(dueLabel(new Date(2026, 9, 15, 7, 0), now)).toEqual({ text: "Tomorrow", tone: "soon" });
    expect(dueLabel(new Date(2026, 9, 13, 7, 0), now)).toEqual({ text: "Yesterday", tone: "overdue" });
    expect(dueLabel(new Date(2026, 9, 10, 7, 0), now)).toEqual({ text: "4 days overdue", tone: "overdue" });
    expect(dueLabel(new Date(2026, 8, 1, 7, 0), now).text).toBe("Overdue since Tue, 1 Sept");
    expect(dueLabel(new Date(2026, 9, 18, 7, 0), now)).toEqual({ text: "Sun, 18 Oct", tone: "soon" });
    expect(dueLabel(new Date(2026, 10, 18, 7, 0), now)).toEqual({ text: "Wed, 18 Nov", tone: "later" });
  });
});

describe("dayPresets", () => {
  it("uses chooser labels and ISO days", () => {
    const list = dayPresets(new Date(2026, 9, 13)); // Tue
    expect(list.map((p) => p.label)).toEqual(["Tomorrow", "This weekend", "Next week", "2 weeks", "1 month", "3 months", "6 months"]);
    expect(list.find((p) => p.id === "this-weekend")).toMatchObject({ short: "Weekend", date: "2026-10-17" });
  });

  it("merges presets landing on the same day (Sunday: next week = tomorrow)", () => {
    const list = dayPresets(new Date(2026, 9, 18)); // Sun
    expect(list.map((p) => p.id)).toEqual(["tomorrow", "next-weekend", "2-weeks", "1-month", "3-months", "6-months"]);
  });
});
