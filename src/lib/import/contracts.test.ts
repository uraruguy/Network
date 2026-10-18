import { describe, expect, it } from "vitest";
import { ExtractionV2, FilingFile, ProfileProposal, ResolutionFile, ScreenResult } from "./contracts";

const person = {
  key: "blaz-novak",
  displayName: "Blaž Novak",
  firstName: "Blaž",
  lastName: "Novak",
  aliases: ["Blaž"],
  disposition: "person",
  existingPersonId: null,
  confidence: 0.92,
  needsReview: false,
  reviewFlags: [],
  reasons: "Same folder Blaž, Goolets context in 4 notes.",
  profile: { role: "CTO", company: "Goolets", categories: ["partner"], keyFacts: ["Loves padel"], activities: ["padel"], metDate: "2024-05" },
};

describe("ResolutionFile", () => {
  it("accepts a valid file and fills defaults", () => {
    const r = ResolutionFile.parse({ packetId: "r01", engine: "claude-code", schemaVersion: 1, people: [person], assignments: [{ mentionId: "abc:0", personKey: "blaz-novak", confidence: 0.9 }] });
    expect(r.people[0]!.profile.tags).toEqual([]);
    expect(r.people[0]!.possibleSameAs).toEqual([]);
    expect(r.assignments[0]!.reason).toBeNull();
  });
  it("rejects bad keys, dispositions and long reasons", () => {
    expect(ResolutionFile.safeParse({ packetId: "r01", engine: "x", schemaVersion: 1, people: [{ ...person, key: "Blaž Novak" }], assignments: [] }).success).toBe(false);
    expect(ResolutionFile.safeParse({ packetId: "r01", engine: "x", schemaVersion: 1, people: [{ ...person, disposition: "friend" }], assignments: [] }).success).toBe(false);
    expect(ResolutionFile.safeParse({ packetId: "r01", engine: "x", schemaVersion: 1, people: [{ ...person, reasons: "x".repeat(301) }], assignments: [] }).success).toBe(false);
    expect(ResolutionFile.safeParse({ packetId: "r01", engine: "x", schemaVersion: 2, people: [], assignments: [] }).success).toBe(false);
  });
  it("normalises possibleSameAs to an array", () => {
    const r = ResolutionFile.parse({ packetId: "r01", engine: "x", schemaVersion: 1, people: [{ ...person, possibleSameAs: "blaz" }], assignments: [] });
    expect(r.people[0]!.possibleSameAs).toEqual(["blaz"]);
  });
});

describe("ProfileProposal", () => {
  it("caps key facts at 8 and validates categories", () => {
    expect(ProfileProposal.safeParse({ keyFacts: Array.from({ length: 9 }, (_, i) => `f${i}`) }).success).toBe(false);
    expect(ProfileProposal.safeParse({ categories: ["bestie"] }).success).toBe(false);
    expect(ProfileProposal.parse({}).categories).toEqual([]);
  });
  it("accepts partial met dates", () => {
    expect(ProfileProposal.parse({ metDate: "2024" }).metDate).toBe("2024");
    expect(ProfileProposal.safeParse({ metDate: "May 2024" }).success).toBe(false);
  });
});

describe("other stage files", () => {
  it("ScreenResult", () => {
    expect(ScreenResult.safeParse({ items: [{ id: "1", kind: "journal", confidence: 0.7, peopleHint: ["Ana"] }] }).success).toBe(true);
    expect(ScreenResult.safeParse({ items: [{ id: "1", kind: "diary", confidence: 0.7, peopleHint: [] }] }).success).toBe(false);
  });
  it("ExtractionV2 defaults version", () => {
    const e = ExtractionV2.parse({ noteSummary: "s", suggestedTitle: "t", occurredAt: null, candidates: [] });
    expect(e.version).toBe(2);
  });
  it("FilingFile", () => {
    const ok = FilingFile.safeParse({ packetId: "f01", engine: "x", schemaVersion: 1, filings: [{ itemId: "6f1c1c1e-1b1a-4a7e-9c55-0d2f8f9a1b2c", mode: "primary", primaryPersonKey: "ana-kos", reason: "title" }] });
    expect(ok.success).toBe(true);
  });
});
