import { describe, expect, it } from "vitest";
import type { PeopleRow } from "./people-filters";
import { comparePeople, indexLetter, parseSort, sortPeople } from "./sort";

function person(id: string, over: Partial<PeopleRow> = {}): PeopleRow {
  return {
    id,
    displayName: id,
    avatarUrl: null,
    headline: null,
    company: null,
    warmth: "active",
    circle: null,
    homeLocation: null,
    categoryIds: [],
    activityIds: [],
    tagIds: [],
    lastInteractionAt: null,
    nextFollowupAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

const PEOPLE: PeopleRow[] = [
  person("a", { displayName: "Žan Novak", warmth: "dormant", lastInteractionAt: "2026-10-01T10:00:00Z", nextFollowupAt: "2026-11-01T00:00:00Z" }),
  person("b", { displayName: "ana lukić", warmth: "inner", lastInteractionAt: "2026-10-10T10:00:00Z" }),
  person("c", { displayName: "Zala Kos", warmth: "inner", lastInteractionAt: null, createdAt: "2026-09-01T00:00:00Z", nextFollowupAt: "2026-10-20T00:00:00Z" }),
  person("d", { displayName: "Ana Horvat", warmth: "archive", lastInteractionAt: new Date("2026-10-05T10:00:00Z") }),
  person("e", { displayName: "Bojan 2", warmth: "active", lastInteractionAt: null, createdAt: "2026-08-01T00:00:00Z" }),
  person("f", { displayName: "Bojan 10", warmth: "active", lastInteractionAt: null, createdAt: "2026-08-01T00:00:00Z" }),
];

const ids = (rows: PeopleRow[]) => rows.map((p) => p.id);

describe("sortPeople", () => {
  it("recent: latest interaction first, never-contacted last (newest added first, then name)", () => {
    expect(ids(sortPeople(PEOPLE, "recent"))).toEqual(["b", "d", "a", "c", "e", "f"]);
  });

  it("name: case- and accent-insensitive, numbers in natural order", () => {
    expect(ids(sortPeople(PEOPLE, "name"))).toEqual(["d", "b", "e", "f", "c", "a"]);
  });

  it("followup: soonest first, people without one last (then by recency)", () => {
    expect(ids(sortPeople(PEOPLE, "followup"))).toEqual(["c", "a", "b", "d", "e", "f"]);
  });

  it("warmth: inner → active → dormant → archive, recency within", () => {
    expect(ids(sortPeople(PEOPLE, "warmth"))).toEqual(["b", "c", "e", "f", "a", "d"]);
  });

  it("with a query, better name matches come first and the sort breaks ties", () => {
    const rows = [
      person("company", { displayName: "Rok Turk", company: "Anaconda", lastInteractionAt: "2026-10-16T00:00:00Z" }),
      person("inside", { displayName: "Ivana Kos", lastInteractionAt: "2026-10-15T00:00:00Z" }),
      person("word", { displayName: "Eva Ana Novak", lastInteractionAt: "2026-10-14T00:00:00Z" }),
      person("prefix2", { displayName: "Ana Zupan", lastInteractionAt: "2026-10-01T00:00:00Z" }),
      person("prefix1", { displayName: "Ana Horvat", lastInteractionAt: "2026-10-12T00:00:00Z" }),
      person("exact", { displayName: "Ana", lastInteractionAt: "2026-01-01T00:00:00Z" }),
    ];
    expect(ids(sortPeople(rows, "recent", "ana"))).toEqual(["exact", "prefix1", "prefix2", "word", "inside", "company"]);
  });

  it("does not mutate its input and is deterministic", () => {
    const copy = [...PEOPLE];
    sortPeople(PEOPLE, "name");
    expect(PEOPLE).toEqual(copy);
    expect(ids(sortPeople(PEOPLE, "recent"))).toEqual(ids(sortPeople([...PEOPLE].reverse(), "recent")));
  });

  it("comparePeople matches sortPeople", () => {
    for (const key of ["recent", "name", "followup", "warmth"] as const) {
      expect(ids([...PEOPLE].sort(comparePeople(key)))).toEqual(ids(sortPeople(PEOPLE, key)));
    }
  });
});

describe("helpers", () => {
  it("parses the sort param with a safe default", () => {
    expect(parseSort("name")).toBe("name");
    expect(parseSort("bogus")).toBe("recent");
    expect(parseSort(null)).toBe("recent");
  });

  it("index letters fold accents and group non-letters under #", () => {
    expect(indexLetter("Žan")).toBe("Z");
    expect(indexLetter("Østergaard")).toBe("O");
    expect(indexLetter("ana")).toBe("A");
    expect(indexLetter("123 Studio")).toBe("#");
    expect(indexLetter("  ")).toBe("#");
  });
});
