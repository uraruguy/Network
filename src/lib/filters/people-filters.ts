/**
 * Client-side people filtering over the compact index (`GET /api/people`).
 * Within a facet selections are OR; across facets they are AND. Search ignores case and diacritics.
 * Shared by the People list and the Globe so both read the same URL params.
 */
import { normalizeForSearch } from "@/components/ui/search";
import type { Warmth } from "@/lib/constants";
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

export const EMPTY_FILTERS: PeopleFilters = { q: "", categoryIds: [], warmth: [], activityIds: [], tagIds: [], locationIds: [] };

/** Row shape on the wire: dates are ISO strings after JSON. */
type Row = Omit<PersonIndexRow, "lastInteractionAt" | "nextFollowupAt" | "createdAt"> & {
  lastInteractionAt: string | Date | null;
  nextFollowupAt: string | Date | null;
  createdAt: string | Date;
};

const anyOf = (selected: readonly string[], values: readonly string[]) => selected.length === 0 || selected.some((s) => values.includes(s));

export function searchText(p: Row): string {
  return normalizeForSearch([p.displayName, p.headline, p.company, p.homeLocation?.name, p.homeLocation?.country].filter(Boolean).join(" "));
}

export function matchesFilters(p: Row, f: PeopleFilters, haystack = searchText(p)): boolean {
  if (f.q.trim()) {
    const terms = normalizeForSearch(f.q).split(/\s+/).filter(Boolean);
    if (!terms.every((t) => haystack.includes(t))) return false;
  }
  return (
    anyOf(f.categoryIds, p.categoryIds) &&
    anyOf(f.warmth, [p.warmth]) &&
    anyOf(f.activityIds, p.activityIds) &&
    anyOf(f.tagIds, p.tagIds) &&
    anyOf(f.locationIds, p.homeLocation ? [p.homeLocation.id] : [])
  );
}

export function filterPeople<T extends Row>(rows: readonly T[], f: PeopleFilters): T[] {
  if (isEmpty(f)) return [...rows];
  return rows.filter((p) => matchesFilters(p, f));
}

export function isEmpty(f: PeopleFilters): boolean {
  return !f.q.trim() && !f.categoryIds.length && !f.warmth.length && !f.activityIds.length && !f.tagIds.length && !f.locationIds.length;
}

export function activeFacetCount(f: PeopleFilters): number {
  return [f.categoryIds, f.warmth, f.activityIds, f.tagIds, f.locationIds].filter((s) => s.length > 0).length;
}

/** Counts per facet value given every OTHER active facet (so a facet's own selection doesn't zero its siblings). */
export function facetCounts<T extends Row>(rows: readonly T[], f: PeopleFilters, facet: Facet): Map<string, number> {
  const without: PeopleFilters = { ...f, ...clearFacet(facet) };
  const counts = new Map<string, number>();
  for (const p of rows) {
    if (!matchesFilters(p, without)) continue;
    for (const v of facetValues(p, facet)) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
}

function facetValues(p: Row, facet: Facet): string[] {
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

function clearFacet(facet: Facet): Partial<PeopleFilters> {
  return { category: { categoryIds: [] }, warmth: { warmth: [] }, activity: { activityIds: [] }, tag: { tagIds: [] }, city: { locationIds: [] } }[facet];
}

/* URL params: ?q=&cat=a,b&w=inner&act=&tag=&city= */
const PARAMS = { categoryIds: "cat", warmth: "w", activityIds: "act", tagIds: "tag", locationIds: "city" } as const;

export function filtersFromParams(params: URLSearchParams): PeopleFilters {
  const list = (k: string) => (params.get(k) ?? "").split(",").filter(Boolean);
  return {
    q: params.get("q") ?? "",
    categoryIds: list(PARAMS.categoryIds),
    warmth: list(PARAMS.warmth) as Warmth[],
    activityIds: list(PARAMS.activityIds),
    tagIds: list(PARAMS.tagIds),
    locationIds: list(PARAMS.locationIds),
  };
}

export function filtersToParams(f: PeopleFilters, base?: URLSearchParams): URLSearchParams {
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
