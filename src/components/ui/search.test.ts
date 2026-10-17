import { describe, expect, it } from "vitest";
import { filterByQuery, matchesQuery, matchRank, normalizeForSearch } from "./search";

describe("normalizeForSearch", () => {
  it("strips diacritics and case", () => {
    expect(normalizeForSearch("Žan Kovačič")).toBe("zan kovacic");
    expect(normalizeForSearch("Lukić")).toBe("lukic");
    expect(normalizeForSearch("  José   Müller ")).toBe("jose muller");
  });
  it("maps letters NFD doesn't decompose", () => {
    expect(normalizeForSearch("Østergaard")).toBe("ostergaard");
    expect(normalizeForSearch("Straße")).toBe("strasse");
    expect(normalizeForSearch("Đorđe Łukasz")).toBe("dorde lukasz");
    expect(normalizeForSearch("Ærø")).toBe("aero");
  });
});

describe("matchesQuery", () => {
  it("is diacritic- and case-insensitive both ways", () => {
    expect(matchesQuery("Žan Kovačič", "zan")).toBe(true);
    expect(matchesQuery("Zan Kovacic", "žan")).toBe(true);
    expect(matchesQuery("Ljubljana", "LJUB")).toBe(true);
  });
  it("requires every token, in any order", () => {
    expect(matchesQuery("Anna Novak · Ljubljana", "novak anna")).toBe(true);
    expect(matchesQuery("Anna Novak", "anna smith")).toBe(false);
  });
  it("empty query matches everything", () => {
    expect(matchesQuery("anything", "   ")).toBe(true);
  });
});

describe("ranking", () => {
  it("prefers exact > prefix > word prefix > substring", () => {
    expect(matchRank("Ana", "ana")).toBe(0);
    expect(matchRank("Anamarija", "ana")).toBe(1);
    expect(matchRank("Maja Ana", "ana")).toBe(2);
    expect(matchRank("Hana", "ana")).toBe(3);
    expect(matchRank("Bob", "ana")).toBe(Infinity);
  });
  it("filterByQuery filters and sorts stably", () => {
    const people = ["Hana Kos", "Ana Zupan", "Žana Potočnik", "Anamarija Horvat", "Bojan"];
    expect(filterByQuery(people, "ana", (x) => x)).toEqual(["Ana Zupan", "Anamarija Horvat", "Hana Kos", "Žana Potočnik"]);
    expect(filterByQuery(people, "zana", (x) => x)).toEqual(["Žana Potočnik"]);
    expect(filterByQuery(people, "", (x) => x)).toEqual(people);
  });
});
