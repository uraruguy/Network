import { describe, expect, it } from "vitest";
import { cardCounts, filledFields, groupKey, likelyDuplicates, listJoin, movedRows, movedSummary, nameKey } from "./duplicates";

describe("nameKey", () => {
  it("ignores case, accents, punctuation, spacing and word order", () => {
    expect(nameKey("Vid Čanabrian")).toBe("canabrian vid");
    expect(nameKey("  čanabrian,  VID ")).toBe("canabrian vid");
    expect(nameKey("Ana-Marija Novak")).toBe(nameKey("Novak Ana Marija"));
    expect(nameKey("—")).toBe("");
  });
});

describe("likelyDuplicates", () => {
  const p = (id: string, displayName: string, createdAt?: string) => ({ id, displayName, createdAt });

  it("groups same-name people, oldest card first, groups by name", () => {
    const people = [p("3", "Vid Čanabrian", "2026-05-01"), p("1", "Ana Novak"), p("2", "vid canabrian", "2026-01-01"), p("4", "Ana Novak"), p("5", "Blaž")];
    expect(likelyDuplicates(people).map((g) => g.map((x) => x.id))).toEqual([
      ["1", "4"],
      ["2", "3"],
    ]);
  });

  it("skips dismissed groups until someone new joins them", () => {
    const pair = [p("a", "Ana Novak"), p("b", "Ana Novak")];
    const dismissed = new Set([groupKey(pair)]);
    expect(likelyDuplicates(pair, dismissed)).toEqual([]);
    expect(likelyDuplicates([...pair, p("c", "Novak Ana")], dismissed)).toHaveLength(1);
  });

  it("never groups nameless rows", () => {
    expect(likelyDuplicates([p("a", "?"), p("b", "!")])).toEqual([]);
  });
});

describe("merge preview wording", () => {
  const moved = { notes: 3, reminders: 1, chat_threads: 0, mentions: 2, person_categories: 1, person_tags: 0, person_activities: 0, introduced: 0, import_proposals: 4 };

  it("lists non-zero moves in a fixed order, without import bookkeeping", () => {
    expect(movedRows(moved).map((r) => [r.label, r.count])).toEqual([
      ["Notes", 3],
      ["Follow-ups", 1],
      ["Mentions", 2],
      ["Categories", 1],
    ]);
    expect(movedSummary(moved)).toBe("3 notes · 1 follow-up · 2 mentions · 1 category");
    expect(movedSummary({ import_proposals: 2 })).toBe("");
  });

  it("labels filled fields and drops internal ones", () => {
    expect(filledFields(["lastInteractionAt", "languages", "company", "hobbies", "email"])).toEqual(["Company", "Email", "Languages"]);
    expect(listJoin(["Company", "Email", "Languages"])).toBe("Company, Email and Languages");
    expect(listJoin(["Company"])).toBe("Company");
    expect(listJoin([])).toBe("");
  });

  it("counts a card's notes, including a key-facts note that would be combined", () => {
    expect(cardCounts({ moved: { notes: 2, reminders: 1 }, factsMerged: true })).toEqual({ notes: 3, followUps: 1 });
    expect(cardCounts(undefined)).toBeNull();
  });
});
