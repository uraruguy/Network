import { describe, expect, it } from "vitest";
import { defaultPrimaryIndex, defaultQuickAction, QUICK_MAX_CHARS, quickExtractInput, quickSaveInput } from "./schema";

const candidate = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  aliases: [],
  surfaces: [name],
  gender: null,
  salience: 0.5,
  role: null,
  company: null,
  city: null,
  country: null,
  metContext: null,
  metDate: null,
  metCity: null,
  categories: [],
  warmth: null,
  circle: null,
  activities: [],
  introducedBy: null,
  keyFacts: [],
  howICanHelp: null,
  whatICanAsk: null,
  followUps: [],
  links: [],
  excerpt: null,
  confidence: 0.9,
  ...extra,
});
const extraction = (n = 2) => ({ noteSummary: "s", suggestedTitle: "Kava z Ano", occurredAt: null, candidates: [candidate("Ana Novak", { salience: 1 }), candidate("Blaž")].slice(0, n) });
const uuid = "4b8c2f8e-3a7d-4c1e-9f0a-1234567890ab";

describe("quickExtractInput", () => {
  it("trims and normalises line endings", () => {
    expect(quickExtractInput.parse({ text: "  Kava z Ano\r\nje bila super  " }).text).toBe("Kava z Ano\nje bila super");
  });
  it("rejects empty, too long and malformed requests", () => {
    expect(quickExtractInput.safeParse({ text: "   " }).success).toBe(false);
    expect(quickExtractInput.safeParse({ text: "x".repeat(QUICK_MAX_CHARS + 1) }).success).toBe(false);
    expect(quickExtractInput.safeParse({ text: "Kava z Ano", personId: "not-a-uuid" }).success).toBe(false);
    expect(quickExtractInput.safeParse({}).success).toBe(false);
  });
  it("accepts an optional person", () => {
    expect(quickExtractInput.parse({ text: "Kava z Ano", personId: uuid }).personId).toBe(uuid);
  });
});

describe("quickSaveInput", () => {
  const ok = {
    text: "Kava z Ano Novak in Blažem.",
    extraction: extraction(),
    people: [
      { index: 0, action: "create", displayName: "Ana Novak" },
      { index: 1, action: "merge", matchPersonId: uuid, displayName: "Blaž Kranjc" },
    ],
    primaryIndex: 0,
  };

  it("accepts a valid save and defaults createReminder", () => {
    const r = quickSaveInput.parse(ok);
    expect(r.people[0]!.createReminder).toBe(true);
    expect(r.extraction.version).toBe(2);
  });
  it("needs a target for merges", () => {
    const r = quickSaveInput.safeParse({ ...ok, people: [{ index: 0, action: "merge", displayName: "Ana" }] });
    expect(r.success).toBe(false);
  });
  it("rejects unknown and duplicate candidate indexes", () => {
    expect(quickSaveInput.safeParse({ ...ok, people: [{ index: 5, action: "create", displayName: "X" }] }).success).toBe(false);
    expect(quickSaveInput.safeParse({ ...ok, people: [ok.people[0], ok.people[0]] }).success).toBe(false);
  });
  it("needs someone to file the note under", () => {
    const skipped = { ...ok, people: ok.people.map((p) => ({ ...p, action: "skip" })), primaryIndex: null };
    expect(quickSaveInput.safeParse(skipped).success).toBe(false);
    // …unless the sheet was opened from a person's page.
    expect(quickSaveInput.safeParse({ ...skipped, personId: uuid }).success).toBe(true);
  });
  it("files the note only under a kept person", () => {
    const r = quickSaveInput.safeParse({ ...ok, people: [ok.people[0], { ...ok.people[1], action: "skip" }], primaryIndex: 1 });
    expect(r.success).toBe(false);
  });
  it("rejects an invalid category", () => {
    expect(quickSaveInput.safeParse({ ...ok, people: [{ index: 0, action: "create", displayName: "Ana", categories: ["boss"] }] }).success).toBe(false);
  });
});

describe("defaults", () => {
  it("merges exact matches, skips weak candidates, creates the rest", () => {
    expect(defaultQuickAction({ confidence: 0.9 }, { exact: true })).toBe("merge");
    expect(defaultQuickAction({ confidence: 0.3 }, null)).toBe("skip");
    expect(defaultQuickAction({ confidence: 0.9 }, { exact: false })).toBe("create");
  });
  it("files under the most salient kept person", () => {
    expect(defaultPrimaryIndex([{ salience: 0.2 }, { salience: 1 }, { salience: 0.5 }], [0, 2])).toBe(2);
    expect(defaultPrimaryIndex([{ salience: 0.2 }], [])).toBeNull();
  });
});
