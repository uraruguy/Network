import { describe, expect, it } from "vitest";
import { isoDate, mergePatch, type MergeCandidate, type MergeTarget } from "./legacy-merge";

const person: MergeTarget = { headline: "Founder", company: null, homeLocationId: null, metContext: null, metAt: null, circle: null, hobbies: ["padel"], howICanHelp: null, whatICanAsk: null, categories: [{ categoryId: "c1" }] };
const cand: MergeCandidate = { role: "CTO", company: null, metContext: null, metDate: null, circle: null, hobbies: [], howICanHelp: null, whatICanAsk: null };

describe("isoDate", () => {
  it("keeps real calendar dates only", () => {
    expect(isoDate("2023-05-04")).toBe("2023-05-04");
    expect(isoDate("2023-05")).toBeNull();
    expect(isoDate("2023-02-31")).toBeNull();
    expect(isoDate(null)).toBeNull();
  });
});

describe("mergePatch", () => {
  it("is empty when nothing changes (no UPDATE without values)", () => {
    expect(mergePatch(person, { ...cand, hobbies: ["padel"] }, null, ["c1"])).toEqual({});
  });

  it("fills blanks only and never overwrites", () => {
    expect(mergePatch(person, { ...cand, company: "Acme", metContext: "Web Summit" }, null, [])).toEqual({ company: "Acme", metContext: "Web Summit" });
  });

  it("drops a partial met date instead of writing it to the date column", () => {
    expect(mergePatch(person, { ...cand, metDate: "2023-05" }, null, [])).toEqual({});
    expect(mergePatch(person, { ...cand, metDate: "2023-05-04" }, null, [])).toEqual({ metAt: "2023-05-04" });
  });

  it("sends legacy hobbies and categories only when something is added", () => {
    expect(mergePatch(person, { ...cand, hobbies: ["padel", "skiing"] }, null, ["c2"])).toEqual({ hobbies: ["padel", "skiing"], categoryIds: ["c1", "c2"] });
  });
});
