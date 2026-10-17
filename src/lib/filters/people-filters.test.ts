import { describe, expect, it } from "vitest";
import {
  activeFacetCount,
  citiesOf,
  clearFacets,
  EMPTY_FILTERS,
  facetCounts,
  filterPeople,
  filtersFromParams,
  filtersToParams,
  hrefWithFilters,
  isEmpty,
  matchesFilters,
  sameFacets,
  searchString,
  selectedValueCount,
  toggleFacetValue,
  withFacet,
  type PeopleFilters,
  type PeopleRow,
} from "./people-filters";

const loc = (id: string, name: string, country = "Slovenia") => ({ id, name, country, countryCode: "SI", lat: 0, lng: 0, timezone: null });

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

const lj = loc("lj", "Ljubljana");
const mb = loc("mb", "Maribor");
const ldn = loc("ldn", "London", "United Kingdom");

const PEOPLE: PeopleRow[] = [
  person("zan", { displayName: "Žan Kovačič", headline: "Founder", company: "Celtra", homeLocation: lj, warmth: "inner", categoryIds: ["friend"], activityIds: ["ski", "run"], tagIds: ["yc"] }),
  person("ana", { displayName: "Ana Lukić", headline: "Designer", homeLocation: mb, warmth: "active", categoryIds: ["friend", "client"], activityIds: ["run"] }),
  person("soren", { displayName: "Søren Østergaard", company: "Novo", homeLocation: ldn, warmth: "dormant", categoryIds: ["investor"], activityIds: ["ski"], tagIds: ["yc", "angel"] }),
  person("noloc", { displayName: "No Location", warmth: "archive" }),
];

const ids = (rows: PeopleRow[]) => rows.map((p) => p.id);
const f = (over: Partial<PeopleFilters>): PeopleFilters => ({ ...EMPTY_FILTERS, ...over });

describe("filterPeople", () => {
  it("returns everyone for empty filters", () => {
    expect(ids(filterPeople(PEOPLE, EMPTY_FILTERS))).toEqual(["zan", "ana", "soren", "noloc"]);
    expect(isEmpty(EMPTY_FILTERS)).toBe(true);
    expect(isEmpty(f({ q: "   " }))).toBe(true);
  });

  it("ORs values within a facet", () => {
    expect(ids(filterPeople(PEOPLE, f({ activityIds: ["ski"] })))).toEqual(["zan", "soren"]);
    expect(ids(filterPeople(PEOPLE, f({ activityIds: ["ski", "run"] })))).toEqual(["zan", "ana", "soren"]);
    expect(ids(filterPeople(PEOPLE, f({ warmth: ["inner", "archive"] })))).toEqual(["zan", "noloc"]);
  });

  it("ANDs across facets", () => {
    expect(ids(filterPeople(PEOPLE, f({ activityIds: ["run"], categoryIds: ["client"] })))).toEqual(["ana"]);
    expect(ids(filterPeople(PEOPLE, f({ activityIds: ["ski"], tagIds: ["yc"], locationIds: ["ldn"] })))).toEqual(["soren"]);
    expect(ids(filterPeople(PEOPLE, f({ activityIds: ["run"], warmth: ["dormant"] })))).toEqual([]);
  });

  it("city filter excludes people without a home city", () => {
    expect(ids(filterPeople(PEOPLE, f({ locationIds: ["lj", "mb"] })))).toEqual(["zan", "ana"]);
  });

  it("searches name, role, company and city ignoring case and diacritics", () => {
    expect(ids(filterPeople(PEOPLE, f({ q: "zan" })))).toEqual(["zan"]);
    expect(ids(filterPeople(PEOPLE, f({ q: "KOVACIC" })))).toEqual(["zan"]);
    expect(ids(filterPeople(PEOPLE, f({ q: "lukic" })))).toEqual(["ana"]);
    expect(ids(filterPeople(PEOPLE, f({ q: "ostergaard" })))).toEqual(["soren"]);
    expect(ids(filterPeople(PEOPLE, f({ q: "Žan" })))).toEqual(["zan"]);
    expect(ids(filterPeople(PEOPLE, f({ q: "celtra" })))).toEqual(["zan"]);
    expect(ids(filterPeople(PEOPLE, f({ q: "ljubljana" })))).toEqual(["zan"]);
    expect(ids(filterPeople(PEOPLE, f({ q: "united kingdom" })))).toEqual(["soren"]);
  });

  it("requires every search term (in any order) and combines with facets", () => {
    expect(ids(filterPeople(PEOPLE, f({ q: "founder zan" })))).toEqual(["zan"]);
    expect(ids(filterPeople(PEOPLE, f({ q: "founder lukic" })))).toEqual([]);
    expect(ids(filterPeople(PEOPLE, f({ q: "a", warmth: ["active"] })))).toEqual(["ana"]);
  });

  it("matchesFilters agrees with filterPeople", () => {
    const filters = f({ q: "an", activityIds: ["run"] });
    expect(PEOPLE.filter((p) => matchesFilters(p, filters)).map((p) => p.id)).toEqual(ids(filterPeople(PEOPLE, filters)));
  });
});

describe("facetCounts", () => {
  it("counts every value over the people matching the OTHER facets", () => {
    const counts = facetCounts(PEOPLE, f({ activityIds: ["ski"] }), "activity");
    // Own facet ignored: counts span everyone.
    expect(Object.fromEntries(counts)).toEqual({ ski: 2, run: 2 });
  });

  it("narrows by other active facets and the search", () => {
    const filters = f({ activityIds: ["ski"], warmth: ["inner"] });
    expect(Object.fromEntries(facetCounts(PEOPLE, filters, "activity"))).toEqual({ ski: 1, run: 1 });
    expect(Object.fromEntries(facetCounts(PEOPLE, filters, "warmth"))).toEqual({ inner: 1, dormant: 1 });
    expect(Object.fromEntries(facetCounts(PEOPLE, f({ q: "lukic" }), "category"))).toEqual({ friend: 1, client: 1 });
  });

  it("counts cities by home location id", () => {
    expect(Object.fromEntries(facetCounts(PEOPLE, EMPTY_FILTERS, "city"))).toEqual({ lj: 1, mb: 1, ldn: 1 });
    expect(Object.fromEntries(facetCounts(PEOPLE, f({ tagIds: ["yc"] }), "city"))).toEqual({ lj: 1, ldn: 1 });
  });
});

describe("facet helpers", () => {
  it("toggles, replaces and clears selections", () => {
    let filters = toggleFacetValue(EMPTY_FILTERS, "tag", "yc");
    expect(filters.tagIds).toEqual(["yc"]);
    filters = toggleFacetValue(filters, "tag", "angel");
    expect(filters.tagIds).toEqual(["yc", "angel"]);
    filters = toggleFacetValue(filters, "tag", "yc");
    expect(filters.tagIds).toEqual(["angel"]);
    filters = withFacet({ ...filters, q: "x" }, "warmth", ["inner"]);
    expect(activeFacetCount(filters)).toBe(2);
    expect(selectedValueCount(filters)).toBe(2);
    expect(clearFacets(filters)).toEqual({ ...EMPTY_FILTERS, q: "x" });
    expect(clearFacets(filters, false)).toEqual(EMPTY_FILTERS);
  });

  it("compares facet selections ignoring the query", () => {
    expect(sameFacets(f({ q: "a", tagIds: ["x"] }), f({ q: "b", tagIds: ["x"] }))).toBe(true);
    expect(sameFacets(f({ tagIds: ["x"] }), f({ tagIds: ["x", "y"] }))).toBe(false);
  });

  it("lists distinct home cities, most people first", () => {
    const rows = [...PEOPLE, person("extra", { homeLocation: mb })];
    expect(citiesOf(rows).map((c) => c.id)).toEqual(["mb", "lj", "ldn"]);
  });
});

describe("URL params", () => {
  it("round-trips through the query string", () => {
    const filters = f({ q: "Žan K", categoryIds: ["a", "b"], warmth: ["inner", "dormant"], activityIds: ["ski"], tagIds: ["yc"], locationIds: ["lj"] });
    const params = filtersToParams(filters);
    expect(filtersFromParams(new URLSearchParams(params.toString()))).toEqual(filters);
    expect(filtersFromParams(new URLSearchParams(searchString(params)))).toEqual(filters);
  });

  it("omits empty facets and keeps unrelated params", () => {
    const params = filtersToParams(f({ tagIds: ["yc"] }), new URLSearchParams("sort=name&q=old&cat=x"));
    expect(params.get("sort")).toBe("name");
    expect(params.get("tag")).toBe("yc");
    expect(params.has("q")).toBe(false);
    expect(params.has("cat")).toBe(false);
  });

  it("drops unknown warmth values, blanks and duplicates", () => {
    const filters = filtersFromParams(new URLSearchParams("w=inner,hot,,inner&act=a,,a,b"));
    expect(filters.warmth).toEqual(["inner"]);
    expect(filters.activityIds).toEqual(["a", "b"]);
  });

  it("writes readable commas and builds cross-view links", () => {
    expect(searchString(filtersToParams(f({ categoryIds: ["a", "b"] })))).toBe("?cat=a,b");
    expect(searchString(new URLSearchParams())).toBe("");
    expect(hrefWithFilters("/globe", f({ warmth: ["inner"], q: "ana" }))).toBe("/globe?q=ana&w=inner");
    expect(hrefWithFilters("/globe", EMPTY_FILTERS)).toBe("/globe");
  });
});
