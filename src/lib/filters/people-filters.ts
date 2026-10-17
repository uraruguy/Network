/**
 * Client-side people filtering over the compact index (`GET /api/people`).
 * Within a facet selections are OR; across facets they are AND. Search ignores case and diacritics.
 * Shared by the People list and the Globe so both read the same URL params.
 */
import { normalizeForSearch } from "@/components/ui/search";
import { WARMTH, type Warmth } from "@/lib/constants";
import type { PersonIndexRow } from "@/lib/queries/types";

export type PeopleFilters = {
  q: string;
  categoryIds: string[];
  warmth: Warmth[];
  activityIds: string[];
  tagIds: string[];
  /** `locations.id` of a person's home city. */
  locationIds: string[];
};

export type Facet = "category" | "warmth" | "activity" | "tag" | "city";

/** Display order of the facet pills. */
export const FACETS: readonly Facet[] = ["category", "warmth", "activity", "tag", "city"];

export const FACET_LABEL: Record<Facet, string> = {
  category: "Category",
  warmth: "Warmth",
  activity: "Activities",
  tag: "Tags",
  city: "City",
};

/** Which `PeopleFilters` list each facet edits. */
export const FACET_KEY = {
  category: "categoryIds",
  warmth: "warmth",
  activity: "activityIds",
  tag: "tagIds",
  city: "locationIds",
} as const satisfies Record<Facet, keyof Omit<PeopleFilters, "q">>;

export const EMPTY_FILTERS: PeopleFilters = { q: "", categoryIds: [], warmth: [], activityIds: [], tagIds: [], locationIds: [] };

/** Row shape on the wire: dates are ISO strings after JSON. */
export type PeopleRow = Omit<PersonIndexRow, "lastInteractionAt" | "nextFollowupAt" | "createdAt"> & {
  lastInteractionAt: string | Date | null;
  nextFollowupAt: string | Date | null;
  createdAt: string | Date;
};
type Row = PeopleRow;

/* ---------- matching ---------- */

/** Normalized haystacks per row object. Index rows are stable references until a refetch, so this is computed once per row. */
const haystacks = new WeakMap<object, string>();

export function searchText(p: Row): string {
  let h = haystacks.get(p);
  if (h === undefined) {
    h = normalizeForSearch([p.displayName, p.headline, p.company, p.homeLocation?.name, p.homeLocation?.country].filter(Boolean).join(" "));
    haystacks.set(p, h);
  }
  return h;
}

/** Normalized search terms of a query ("Žan  K" → ["zan", "k"]). */
export function queryTerms(q: string): string[] {
  return normalizeForSearch(q).split(" ").filter(Boolean);
}

type Predicate = (p: Row) => boolean;

/** Builds a fast predicate for `f` (terms and selection sets are prepared once, not per row). */
export function compileFilters(f: PeopleFilters): Predicate {
  const terms = queryTerms(f.q);
  const cat = f.categoryIds.length ? new Set(f.categoryIds) : null;
  const warm = f.warmth.length ? new Set<string>(f.warmth) : null;
  const act = f.activityIds.length ? new Set(f.activityIds) : null;
  const tag = f.tagIds.length ? new Set(f.tagIds) : null;
  const city = f.locationIds.length ? new Set(f.locationIds) : null;
  const any = (set: Set<string> | null, values: readonly string[]) => !set || values.some((v) => set.has(v));
  return (p) => {
    if (terms.length) {
      const hay = searchText(p);
      for (const t of terms) if (!hay.includes(t)) return false;
    }
    return (
      any(cat, p.categoryIds) &&
      (!warm || warm.has(p.warmth)) &&
      any(act, p.activityIds) &&
      any(tag, p.tagIds) &&
      (!city || (!!p.homeLocation && city.has(p.homeLocation.id)))
    );
  };
}

/** One-off check (for many rows, use `compileFilters` once and reuse the predicate). */
export function matchesFilters(p: Row, f: PeopleFilters): boolean {
  return compileFilters(f)(p);
}

export function filterPeople<T extends Row>(rows: readonly T[], f: PeopleFilters): T[] {
  if (isEmpty(f)) return [...rows];
  const match = compileFilters(f);
  return rows.filter(match);
}

export function isEmpty(f: PeopleFilters): boolean {
  return !f.q.trim() && !f.categoryIds.length && !f.warmth.length && !f.activityIds.length && !f.tagIds.length && !f.locationIds.length;
}

/** Number of facets with at least one selection (search not included). */
export function activeFacetCount(f: PeopleFilters): number {
  return [f.categoryIds, f.warmth, f.activityIds, f.tagIds, f.locationIds].filter((s) => s.length > 0).length;
}

/** Total selected values across all facets (search not included). */
export function selectedValueCount(f: PeopleFilters): number {
  return f.categoryIds.length + f.warmth.length + f.activityIds.length + f.tagIds.length + f.locationIds.length;
}

/* ---------- facets ---------- */

/** Counts per facet value given every OTHER active facet (so a facet's own selection doesn't zero its siblings). */
export function facetCounts<T extends Row>(rows: readonly T[], f: PeopleFilters, facet: Facet): Map<string, number> {
  const match = compileFilters({ ...f, [FACET_KEY[facet]]: [] });
  const counts = new Map<string, number>();
  for (const p of rows) {
    if (!match(p)) continue;
    for (const v of facetValues(p, facet)) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
}

export function facetValues(p: Row, facet: Facet): readonly string[] {
  switch (facet) {
    case "category":
      return p.categoryIds;
    case "warmth":
      return [p.warmth];
    case "activity":
      return p.activityIds;
    case "tag":
      return p.tagIds;
    case "city":
      return p.homeLocation ? [p.homeLocation.id] : [];
  }
}

export function facetSelection(f: PeopleFilters, facet: Facet): readonly string[] {
  return f[FACET_KEY[facet]];
}

/** Replaces one facet's selection. */
export function withFacet(f: PeopleFilters, facet: Facet, values: readonly string[]): PeopleFilters {
  return { ...f, [FACET_KEY[facet]]: [...values] };
}

/** Adds or removes one value of a facet. */
export function toggleFacetValue(f: PeopleFilters, facet: Facet, value: string): PeopleFilters {
  const current = facetSelection(f, facet);
  return withFacet(f, facet, current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
}

/** Clears every facet; keeps the search unless `keepQuery` is false. */
export function clearFacets(f: PeopleFilters, keepQuery = true): PeopleFilters {
  return { ...EMPTY_FILTERS, q: keepQuery ? f.q : "" };
}

export function sameFilters(a: PeopleFilters, b: PeopleFilters): boolean {
  return a.q === b.q && FACETS.every((facet) => sameList(facetSelection(a, facet), facetSelection(b, facet)));
}

/** Facet selections equal (search ignored). */
export function sameFacets(a: PeopleFilters, b: PeopleFilters): boolean {
  return FACETS.every((facet) => sameList(facetSelection(a, facet), facetSelection(b, facet)));
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Distinct home cities of `rows`, most people first. */
export function citiesOf<T extends Row>(rows: readonly T[]): NonNullable<Row["homeLocation"]>[] {
  const byId = new Map<string, { loc: NonNullable<Row["homeLocation"]>; n: number }>();
  for (const p of rows) {
    const loc = p.homeLocation;
    if (!loc) continue;
    const hit = byId.get(loc.id);
    if (hit) hit.n++;
    else byId.set(loc.id, { loc, n: 1 });
  }
  return [...byId.values()].sort((a, b) => b.n - a.n || a.loc.name.localeCompare(b.loc.name)).map((x) => x.loc);
}

/* ---------- URL params: ?q=&cat=a,b&w=inner&act=&tag=&city= ---------- */

const PARAMS = { categoryIds: "cat", warmth: "w", activityIds: "act", tagIds: "tag", locationIds: "city" } as const;

/** Every query param the filters own (other params, e.g. `sort` or `new`, are left alone). */
export const FILTER_PARAM_NAMES: readonly string[] = ["q", ...Object.values(PARAMS)];

const WARMTH_SET = new Set<string>(WARMTH);

export function filtersFromParams(params: URLSearchParams | { get(name: string): string | null }): PeopleFilters {
  const list = (k: string) => [...new Set((params.get(k) ?? "").split(",").map((v) => v.trim()).filter(Boolean))];
  return {
    q: params.get("q") ?? "",
    categoryIds: list(PARAMS.categoryIds),
    warmth: list(PARAMS.warmth).filter((w): w is Warmth => WARMTH_SET.has(w)),
    activityIds: list(PARAMS.activityIds),
    tagIds: list(PARAMS.tagIds),
    locationIds: list(PARAMS.locationIds),
  };
}

export function filtersToParams(f: PeopleFilters, base?: URLSearchParams | string): URLSearchParams {
  const out = new URLSearchParams(base);
  if (f.q.trim()) out.set("q", f.q);
  else out.delete("q");
  for (const [key, param] of Object.entries(PARAMS) as [keyof typeof PARAMS, string][]) {
    const values = f[key];
    if (values.length) out.set(param, values.join(","));
    else out.delete(param);
  }
  return out;
}

/** Query string for params, keeping list commas readable (`cat=a,b`, not `cat=a%2Cb`). */
export function searchString(params: URLSearchParams): string {
  const qs = params.toString().replace(/%2C/gi, ",");
  return qs ? `?${qs}` : "";
}

/** `/globe?cat=…` etc. — a link to another view carrying only the filter params. */
export function hrefWithFilters(pathname: string, f: PeopleFilters): string {
  return `${pathname}${searchString(filtersToParams(f))}`;
}
