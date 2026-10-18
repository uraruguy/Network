import { describe, expect, it } from "vitest";
import { bumpStats, dayKey, daysOverdue, greeting, reconnectCandidates, silenceLabel, splitReminders, weekHorizon } from "./today-data";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0);
const NOW = at(2026, 10, 17, 15);

describe("greeting", () => {
  it("follows the local hour and uses the first name", () => {
    expect(greeting(at(2026, 10, 17, 8), "Jakob Kavčič")).toBe("Good morning, Jakob");
    expect(greeting(at(2026, 10, 17, 13))).toBe("Good afternoon");
    expect(greeting(at(2026, 10, 17, 21), "  ")).toBe("Good evening");
    expect(greeting(at(2026, 10, 17, 2), "Jakob")).toBe("Good evening, Jakob");
  });
});

describe("splitReminders", () => {
  it("puts overdue + today in due and the next 7 days in week", () => {
    const rows = [
      { id: "old", dueAt: at(2026, 10, 1).toISOString() },
      { id: "today-late", dueAt: at(2026, 10, 17, 23).toISOString() },
      { id: "tomorrow", dueAt: at(2026, 10, 18, 9).toISOString() },
      { id: "day7", dueAt: at(2026, 10, 24, 20).toISOString() },
      { id: "day8", dueAt: at(2026, 10, 25, 9).toISOString() },
    ];
    const { due, week, overdue } = splitReminders(rows, NOW);
    expect(due.map((r) => r.id)).toEqual(["old", "today-late"]);
    expect(week.map((r) => r.id)).toEqual(["tomorrow", "day7"]);
    expect(overdue).toBe(1);
  });

  it("uses a horizon at the end of the 7th day", () => {
    expect(weekHorizon(NOW).getDate()).toBe(24);
    expect(weekHorizon(NOW).getHours()).toBe(23);
  });
});

describe("bumpStats", () => {
  const stats = { people: 9, overdue: 2, dueToday: 3, upcoming7d: 4 };

  it("moves the counter the follow-up's due date falls in", () => {
    expect(bumpStats(stats, at(2026, 10, 10), NOW, -1)).toMatchObject({ overdue: 1, dueToday: 3, upcoming7d: 4 });
    expect(bumpStats(stats, at(2026, 10, 17, 9), NOW, -1)).toMatchObject({ overdue: 2, dueToday: 2, upcoming7d: 4 });
    expect(bumpStats(stats, at(2026, 10, 17, 23), NOW, -1)).toMatchObject({ dueToday: 2 });
  });

  it("leaves Due today alone for an upcoming (this-week) follow-up", () => {
    expect(bumpStats(stats, at(2026, 10, 18, 9), NOW, -1)).toMatchObject({ overdue: 2, dueToday: 3, upcoming7d: 3 });
    expect(bumpStats(stats, at(2026, 11, 30), NOW, -1)).toBe(stats);
  });

  it("undo puts it back, and never goes below zero", () => {
    expect(bumpStats(stats, at(2026, 10, 18, 9), NOW, +1)).toMatchObject({ upcoming7d: 5 });
    expect(bumpStats({ ...stats, dueToday: 0 }, at(2026, 10, 17), NOW, -1)).toMatchObject({ dueToday: 0 });
  });
});

describe("daysOverdue / dayKey", () => {
  it("counts calendar days", () => {
    expect(daysOverdue(at(2026, 10, 14, 23), NOW)).toBe(3);
    expect(daysOverdue(at(2026, 10, 17, 1), NOW)).toBe(0);
    expect(dayKey(NOW)).toBe("2026-10-17");
  });
});

describe("reconnectCandidates", () => {
  const p = (id: string, warmth: "inner" | "active" | "dormant" | "archive", daysAgo: number | null) => ({
    id,
    warmth,
    lastInteractionAt: daysAgo === null ? null : new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
  });

  it("keeps inner/active people silent for 60+ days, inner first, longest silence first", () => {
    const rows = [p("a1", "active", 90), p("i1", "inner", 61), p("i2", "inner", 200), p("recent", "inner", 10), p("d", "dormant", 400), p("never", "active", null), p("a2", "active", 300)];
    expect(reconnectCandidates(rows, NOW).map((r) => r.id)).toEqual(["i2", "i1", "a2", "a1", "never"]);
  });

  it("respects the limit", () => {
    const rows = Array.from({ length: 20 }, (_, i) => p(`x${i}`, "active", 100 + i));
    expect(reconnectCandidates(rows, NOW, 5)).toHaveLength(5);
  });
});

describe("silenceLabel", () => {
  it("compacts the gap", () => {
    const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
    expect(silenceLabel(null, NOW)).toBeNull();
    expect(silenceLabel(ago(3), NOW)).toBe("3 d");
    expect(silenceLabel(ago(61), NOW)).toBe("8 wk");
    expect(silenceLabel(ago(95), NOW)).toBe("3 mo");
    expect(silenceLabel(ago(800), NOW)).toBe("2 yr");
  });
});
