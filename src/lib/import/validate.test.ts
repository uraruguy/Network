import { describe, expect, it } from "vitest";
import { mergeProfiles, readProfile } from "./profile";
import { validateFiling, validateResolution } from "./validate";

const mention = (id: string, itemId = "11111111-1111-4111-8111-111111111111") => ({
  mentionId: id, itemId, index: Number(id.split(":")[1]), surface: "Blaž", aliases: [], lemmas: ["blaz"], folders: ["Blaž"], title: "Kava", date: "2026-10-01",
  classification: "meeting", extractionVersion: 2, role: null, company: null, city: null, categories: [], keyFacts: [], salience: 0.9, gender: "m", genderHint: "m",
  coMentions: [], snippets: [], excerpt: null, confidence: 0.8, noteFile: "notes/x.md",
});
const packet = {
  packetId: "r01", schemaVersion: 1, runId: "t", kind: "ambiguous",
  clusters: [{ clusterId: "c001", label: "Blaž", mentionIds: ["a:0", "a:1"], part: null, siblings: [] }],
  mentions: [mention("a:0"), mention("a:1")],
  anchors: [
    { kind: "person", id: "22222222-2222-4222-8222-222222222222", key: null, displayName: "Blaž Novak", aliases: [], summary: "", status: null },
    { kind: "proposal", id: "p1", key: "blaz-kranjc", displayName: "Blaž Kranjc", aliases: [], summary: "", status: "committed" },
  ],
};
const person = { key: "blaz-novak", displayName: "Blaž Novak", aliases: [], disposition: "person", confidence: 0.9, needsReview: false, reasons: "folder", profile: {} };

describe("validateResolution", () => {
  it("accepts assignments to declared keys and anchor proposal keys", () => {
    const v = validateResolution(
      { packetId: "r01", engine: "x", schemaVersion: 1, people: [{ ...person, existingPersonId: "22222222-2222-4222-8222-222222222222" }], assignments: [{ mentionId: "a:0", personKey: "blaz-novak", confidence: 0.9 }, { mentionId: "a:1", personKey: "blaz-kranjc", confidence: 0.8 }] },
      packet,
    );
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
  });
  it("reports unassigned, double-assigned, unknown and undeclared", () => {
    const v = validateResolution(
      { packetId: "r01", engine: "x", schemaVersion: 1, people: [person], assignments: [{ mentionId: "a:0", personKey: "blaz-novak", confidence: 0.9 }, { mentionId: "a:0", personKey: "nobody", confidence: 0.9 }, { mentionId: "zz:9", personKey: null, confidence: 0.9 }] },
      packet,
    );
    expect(v.ok).toBe(false);
    expect(v.errors.join("\n")).toMatch(/a:1 is not assigned/);
    expect(v.errors.join("\n")).toMatch(/a:0 assigned 2 times/);
    expect(v.errors.join("\n")).toMatch(/undeclared key "nobody"/);
    expect(v.errors.join("\n")).toMatch(/unknown mentionId zz:9/);
  });
  it("checks existingPersonId against anchors or the database", () => {
    const file = { packetId: "r01", engine: "x", schemaVersion: 1, people: [{ ...person, existingPersonId: "33333333-3333-4333-8333-333333333333" }], assignments: [{ mentionId: "a:0", personKey: "blaz-novak", confidence: 0.9 }, { mentionId: "a:1", personKey: null, confidence: 0.9 }] };
    expect(validateResolution(file, packet).ok).toBe(false);
    expect(validateResolution(file, packet, () => true).ok).toBe(true);
  });
  it("warns about Jakob as a person and low confidence without review", () => {
    const v = validateResolution(
      { packetId: "r01", engine: "x", schemaVersion: 1, people: [{ ...person, key: "jakob", displayName: "Jakob", confidence: 0.6 }], assignments: [{ mentionId: "a:0", personKey: "jakob", confidence: 0.9 }, { mentionId: "a:1", personKey: null, confidence: 0.9 }] },
      packet,
    );
    expect(v.ok).toBe(true);
    expect(v.warnings.join("\n")).toMatch(/Jakob himself/);
    expect(v.warnings.join("\n")).toMatch(/without needsReview/);
  });
});

describe("validateFiling", () => {
  const fp = { packetId: "f01", schemaVersion: 1, runId: "t", items: [{ itemId: "11111111-1111-4111-8111-111111111111", title: "x", folders: [], classification: "meeting", noteFile: "n", why: "", people: [{ personKey: "blaz-novak", displayName: "Blaž", surfaces: [], salience: 0.5, status: "approved" }] }] };
  it("requires primary keys from the note and verbatim excerpts", () => {
    const text = "Blaž je rekel nekaj.";
    const ok = validateFiling({ packetId: "f01", engine: "x", schemaVersion: 1, filings: [{ itemId: fp.items[0]!.itemId, mode: "journal", excerpts: [{ personKey: "blaz-novak", excerpt: "Blaž je rekel nekaj." }] }] }, fp, () => text);
    expect(ok.ok).toBe(true);
    const bad = validateFiling({ packetId: "f01", engine: "x", schemaVersion: 1, filings: [{ itemId: fp.items[0]!.itemId, mode: "primary", primaryPersonKey: "kaja", excerpts: [{ personKey: "blaz-novak", excerpt: "paraphrase" }] }] }, fp, () => text);
    expect(bad.errors.length).toBe(2);
  });
});

describe("profiles", () => {
  it("merges: first wins scalars, lists unioned, key facts capped", () => {
    const a = readProfile({ role: "CTO", categories: ["partner"], keyFacts: ["a", "b"], activities: ["Padel"], firstSeen: "2025-01-01", lastSeen: "2025-06-01" });
    const b = readProfile({ role: "CEO", company: "Goolets", categories: ["friend", "partner"], keyFacts: ["b", "c", "d", "e", "f", "g", "h", "i"], activities: ["padel", "hiking"], firstSeen: "2024-05-01", lastSeen: "2026-01-01" });
    const m = mergeProfiles(a, b);
    expect(m).toMatchObject({ role: "CTO", company: "Goolets", categories: ["partner", "friend"], activities: ["Padel", "hiking"], firstSeen: "2024-05-01", lastSeen: "2026-01-01" });
    expect(m.keyFacts).toHaveLength(8);
  });
  it("reads broken profiles field by field", () => {
    const p = readProfile({ role: "CTO", categories: ["bestie"], keyFacts: "nope" });
    expect(p.role).toBe("CTO");
    expect(p.categories).toEqual([]);
  });
});
