import { describe, expect, it } from "vitest";
import { buildMentions, findNameHits, normalizeExtraction, variantSet, verbatimExcerpt } from "./mentions";
import { cleanRows, diffAgainstItems } from "./diff";
import { cityQueries, createGeocoder } from "./geo";
import { mergeChunkCandidates } from "./merge";
import { chunkNote } from "@/lib/ai/prompts/extract";

const text = `Kava z Blažem v Ljubljani.
Blaž je rekou, da gre na Goolets.

Potem sem srečal Kajo. Kaja je rekla, da bo poslala deck.`;

describe("mentions", () => {
  it("finds declined forms of a name", () => {
    const hits = findNameHits(text, variantSet(["Blaž"]));
    expect(hits.map((h) => h.word)).toEqual(["Blažem", "Blaž"]);
    expect(findNameHits(text, variantSet(["Kaja"])).map((h) => h.word)).toEqual(["Kajo", "Kaja"]);
  });

  it("verbatim excerpt is a real substring", () => {
    const hit = text.indexOf("Kajo");
    const ex = verbatimExcerpt(text, "Kaja said she'd send a deck", hit)!;
    expect(text.includes(ex)).toBe(true);
    expect(ex).toContain("Kaja je rekla");
    expect(verbatimExcerpt(text, "Kaja je rekla, da bo poslala deck.", null)).toBe("Kaja je rekla, da bo poslala deck.");
  });

  it("normalises v1 extractions", () => {
    const ex = normalizeExtraction({ candidates: [{ name: "Blaž", hobbies: ["padel", "other"], followUps: [{ what: "x", when: "2026-11-01" }], confidence: 0.8 }] }, 1);
    expect(ex.version).toBe(1);
    expect(ex.candidates[0]!.activities).toEqual(["padel"]);
    expect(ex.candidates[0]!.followUps[0]!.explicitDate).toBe("2026-11-01");
  });

  it("builds mention records with snippets, gender hints, co-mentions", () => {
    const ms = buildMentions([
      {
        id: "item1",
        title: "Kava 3.10.2026",
        text,
        folders: ["Blaž"],
        created: new Date("2026-10-04T10:00:00Z"),
        classification: "meeting",
        extractionVersion: 1,
        candidates: { candidates: [{ name: "Blaž", confidence: 0.9 }, { name: "Kaja", confidence: 0.6 }] },
      },
    ]);
    expect(ms).toHaveLength(2);
    expect(ms[0]).toMatchObject({ mentionId: "item1:0", surface: "Blaž", date: "2026-10-03", genderHint: "m", coMentions: ["Kaja"], noteFile: "notes/item1.md" });
    expect(ms[1]!.genderHint).toBe("f");
    expect(ms[0]!.snippets.length).toBeGreaterThan(0);
  });
});

describe("diff", () => {
  it("collapses duplicate ids and classifies rows", () => {
    const { rows, duplicates } = cleanRows([
      { id: "a", title: "A", html: "<b>a</b>", text: " a ", folder: "Peter" },
      { id: "a", title: "A", html: "<b>a</b>", text: " a ", folder: "Business" },
      { id: "b", title: "B", html: null, text: "b2", folder: "X" },
      { id: "c", title: "C new", html: null, text: "c", folder: "X" },
      { id: "d", title: "D", html: null, text: "", folder: "X", locked: true },
      { id: "e", title: "E", html: null, text: "e", folder: "X" },
    ]);
    expect(duplicates).toBe(1);
    expect(rows[0]!.folders).toEqual(["Peter", "Business"]);
    const existing = [
      { id: "1", externalId: "a", contentHash: rows[0]!.hash, status: "extracted", title: "A", html: "<b>a</b>", folders: ["Peter", "Business"], goneAt: null, noteId: null },
      { id: "2", externalId: "b", contentHash: "old", status: "committed", title: "B", html: null, folders: ["X"], goneAt: null, noteId: "n" },
      { id: "3", externalId: "c", contentHash: rows[2]!.hash, status: "skipped", title: "C", html: null, folders: ["X"], goneAt: null, noteId: null },
      { id: "4", externalId: "z", contentHash: "z", status: "skipped", title: "Z", html: null, folders: [], goneAt: null, noteId: null },
    ];
    const kinds = Object.fromEntries(diffAgainstItems(rows, existing).map((e) => [e.externalId, e.kind]));
    expect(kinds).toEqual({ a: "unchanged", b: "changed", c: "meta", d: "locked", e: "new", z: "gone" });
  });
});

describe("geo", () => {
  it("aliases and locatives", () => {
    expect(cityQueries("SF")[0]).toBe("San Francisco");
    expect(cityQueries("Ljubljani")[0]).toBe("Ljubljana");
    expect(cityQueries("Berlinu")).toContain("Berlin");
  });
  it("prefers the requested country and caches", async () => {
    let calls = 0;
    const geo = createGeocoder(async (q) => {
      calls++;
      return q === "Portland"
        ? [
            { id: 1, name: "Portland", admin: "Oregon", country: "United States", countryCode: "US", lat: 0, lng: 0, timezone: null },
            { id: 2, name: "Portland", admin: "Victoria", country: "Australia", countryCode: "AU", lat: 0, lng: 0, timezone: null },
          ]
        : [];
    });
    expect((await geo("Portland", "Avstralija"))?.id).toBe(1); // unknown alias → first hit
    expect((await geo("Portland", "Australia"))?.id).toBe(2);
    await geo("Portland", "Australia");
    expect(calls).toBe(2);
  });
});

describe("merge + chunking", () => {
  it("merges chunk candidates by name", () => {
    const c = (name: string, extra: object = {}) => ({
      name, aliases: [], surfaces: [name], gender: null, salience: 0.5, role: null, company: null, city: null, country: null, metContext: null, metDate: null, metCity: null,
      categories: [], warmth: null, circle: null, activities: [], introducedBy: null, keyFacts: [], howICanHelp: null, whatICanAsk: null, followUps: [], links: [], excerpt: null, confidence: 0.6, ...extra,
    });
    const merged = mergeChunkCandidates([[c("Blaž", { keyFacts: ["a"] })], [c("Blaž Novak", { role: "CTO", keyFacts: ["b"], salience: 0.9 }), c("Kaja")]]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ name: "Blaž Novak", role: "CTO", salience: 0.9, keyFacts: ["a", "b"], aliases: ["Blaž"] });
  });
  it("chunks long notes at blank lines", () => {
    const long = Array.from({ length: 30 }, (_, i) => `Odstavek ${i}\n${"x".repeat(900)}`).join("\n\n");
    const chunks = chunkNote(long, 12000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 12000)).toBe(true);
    expect(chunks.join("").replace(/\s/g, "").length).toBe(long.replace(/\s/g, "").length);
  });
});
