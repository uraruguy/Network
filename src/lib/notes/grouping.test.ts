import { describe, expect, it } from "vitest";
import { bucketFor, formatNoteLongDate, formatNoteRowDate, groupNotes } from "./grouping";

// Saturday 17 October 2026, 15:00 local time.
const NOW = new Date(2026, 9, 17, 15, 0);
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

describe("bucketFor", () => {
  it.each([
    [at(2026, 10, 17, 0, 5), "Today"],
    [at(2026, 10, 16, 23, 59), "Yesterday"],
    [at(2026, 10, 15), "Previous 7 Days"],
    [at(2026, 10, 10), "Previous 7 Days"],
    [at(2026, 10, 9), "Previous 30 Days"],
    [at(2026, 9, 17), "Previous 30 Days"],
    [at(2026, 9, 16), "September"],
    [at(2026, 1, 2), "January"],
    [at(2025, 12, 31), "2025"],
    [at(2019, 6, 1), "2019"],
    [at(2026, 10, 20), "Upcoming"],
  ])("%s → %s", (date, label) => {
    expect(bucketFor(date, NOW).label).toBe(label);
  });
});

describe("groupNotes", () => {
  const notes = [
    { id: "a", occurredAt: at(2026, 10, 17, 9), pinned: false },
    { id: "b", occurredAt: at(2026, 10, 17, 14), pinned: false },
    { id: "c", occurredAt: at(2026, 10, 16), pinned: false },
    { id: "d", occurredAt: at(2026, 3, 1), pinned: true },
    { id: "e", occurredAt: at(2026, 8, 1), pinned: false },
    { id: "f", occurredAt: at(2026, 3, 3), pinned: false },
    { id: "g", occurredAt: at(2024, 5, 5), pinned: false },
    { id: "h", occurredAt: at(2025, 5, 5), pinned: false },
    { id: "i", occurredAt: at(2026, 10, 12), pinned: false },
  ];

  it("orders sections Apple-style with pinned first", () => {
    const sections = groupNotes(notes, NOW);
    expect(sections.map((s) => s.label)).toEqual(["Pinned", "Today", "Yesterday", "Previous 7 Days", "August", "March", "2025", "2024"]);
  });

  it("sorts newest first within a section and keeps pinned notes out of date sections", () => {
    const sections = groupNotes(notes, NOW);
    expect(sections.find((s) => s.key === "today")!.items.map((n) => n.id)).toEqual(["b", "a"]);
    expect(sections.find((s) => s.key === "pinned")!.items.map((n) => n.id)).toEqual(["d"]);
    expect(sections.flatMap((s) => s.items).filter((n) => n.id === "d")).toHaveLength(1);
  });

  it("returns no sections for no notes", () => {
    expect(groupNotes([], NOW)).toEqual([]);
  });
});

describe("date formatting", () => {
  it("formats row dates like Apple Notes", () => {
    expect(formatNoteRowDate(at(2026, 10, 17, 14, 32), NOW)).toBe("14:32");
    expect(formatNoteRowDate(at(2026, 10, 16), NOW)).toBe("Yesterday");
    expect(formatNoteRowDate(at(2026, 10, 13), NOW)).toBe("Tuesday");
    expect(formatNoteRowDate(at(2026, 3, 4), NOW)).toBe("4 Mar");
    expect(formatNoteRowDate(at(2024, 3, 4), NOW)).toBe("4 Mar 2024");
  });

  it("formats the long date line", () => {
    expect(formatNoteLongDate(at(2026, 10, 14, 14, 32))).toBe("14 October 2026 at 14:32");
  });
});
