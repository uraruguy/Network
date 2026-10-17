import { describe, expect, it } from "vitest";
import { applyPersonPatch, indexRowFromDetail, isTempId, resolveTags, seedPersonDetail, upsertIndexRow, type Lookups } from "./people-cache";
import type { Category, PersonIndexRow } from "./types";

const cat = (id: string, name: string, sort: number) => ({ id, name, sort, color: "#0fb5ba", icon: "star", slug: name.toLowerCase() }) as unknown as Category;

const lookups: Lookups = {
  categories: [cat("c2", "Mentor", 2), cat("c1", "Friend", 1)],
  activities: [
    { id: "a1", name: "Coffee", sort: 1 },
    { id: "a2", name: "Climbing", sort: 0 },
  ],
  tags: [{ id: "t1", name: "Founder", color: null }],
  people: [{ id: "intro", displayName: "Joel", avatarUrl: null }],
};

const now = new Date("2026-10-18T10:00:00.000Z");
const ljubljana = { cityId: 3196359, name: "Ljubljana", admin: "Ljubljana", country: "Slovenia", countryCode: "SI", lat: 46.05, lng: 14.5, timezone: "Europe/Ljubljana" };

describe("seedPersonDetail", () => {
  it("builds a complete detail with resolved relations", () => {
    const p = seedPersonDetail(
      { id: "new", displayName: "  Ana Novak ", homeLocation: ljubljana, categoryIds: ["c2", "c1"], activityIds: ["a1", "a2"], tagNames: ["founder", "Climber"], introducedById: "intro" },
      lookups,
      now,
    );
    expect(p.id).toBe("new");
    expect(p.displayName).toBe("Ana Novak");
    expect(p.warmth).toBe("active");
    expect(p.homeLocation).toMatchObject({ name: "Ljubljana", timezone: "Europe/Ljubljana" });
    expect(isTempId(p.homeLocation!.id)).toBe(true);
    expect(p.categoryIds).toEqual(["c1", "c2"]); // category order
    expect(p.activityIds).toEqual(["a2", "a1"]); // activity order
    expect(p.tags.map((t) => t.name)).toEqual(["Climber", "Founder"]);
    expect(p.tags.find((t) => t.name === "Founder")!.id).toBe("t1"); // existing tag matched case-insensitively
    expect(p.introducedBy).toEqual({ id: "intro", displayName: "Joel", avatarUrl: null });
    expect(p.reminders).toEqual([]);
    expect(p.notes).toEqual([]);
    expect(String(p.createdAt)).toBe(now.toISOString());
  });
});

describe("applyPersonPatch", () => {
  const base = seedPersonDetail({ id: "p", displayName: "Ana", headline: "Designer", homeLocation: ljubljana }, lookups, now);

  it("only touches patched fields and trims blanks to null", () => {
    const next = applyPersonPatch(base, { company: "  Kova ", headline: "   " }, lookups, now);
    expect(next.company).toBe("Kova");
    expect(next.headline).toBeNull();
    expect(next.homeLocation).toBe(base.homeLocation); // same city → same object
  });

  it("clears and replaces places", () => {
    expect(applyPersonPatch(base, { homeLocation: null }).homeLocation).toBeNull();
    const moved = applyPersonPatch(base, { homeLocation: { ...ljubljana, cityId: 1, name: "Maribor" } });
    expect(moved.homeLocation!.name).toBe("Maribor");
    expect(moved.homeLocationId).toBe(moved.homeLocation!.id);
  });

  it("never lets a person introduce themselves", () => {
    expect(applyPersonPatch(base, { introducedById: "p" }, lookups).introducedBy).toBeNull();
    expect(applyPersonPatch(base, { introducedById: "intro" }, lookups).introducedBy?.displayName).toBe("Joel");
  });
});

describe("resolveTags", () => {
  it("dedupes case-insensitively, keeps existing spellings, sorts by name", () => {
    expect(resolveTags(["founder", "FOUNDER", " vc  fund ", ""], lookups)).toEqual([
      { id: "t1", name: "Founder", color: null },
      { id: "tmp:vc fund", name: "vc fund", color: null },
    ]);
  });
});

describe("index rows", () => {
  it("derives the compact row and upserts newest first", () => {
    const p = seedPersonDetail({ id: "new", displayName: "Ana", homeLocation: ljubljana }, lookups, now);
    const row = indexRowFromDetail(p);
    expect(row).toMatchObject({ id: "new", displayName: "Ana", homeLocation: { name: "Ljubljana", countryCode: "SI" } });
    const existing = [{ ...row, id: "old" }] as PersonIndexRow[];
    expect(upsertIndexRow(existing, row).map((r) => r.id)).toEqual(["new", "old"]);
    expect(upsertIndexRow([row, ...existing], { ...row, displayName: "Ana N." }).map((r) => r.displayName)).toEqual(["Ana N.", "Ana"]);
  });
});
