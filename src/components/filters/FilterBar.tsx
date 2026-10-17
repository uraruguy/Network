"use client";
import type { Facet, PeopleFilters } from "@/lib/filters/people-filters";
import type { PersonIndexRow } from "@/lib/queries/types";

/**
 * Search + facet pills (Category / Warmth / Activities / Tags / City), multi-select with live counts.
 * `variant="map"` is the compact glass-map version used over the globe. (Contract stub; the People-list track implements it.)
 */
export type FilterBarProps = {
  filters: PeopleFilters;
  onChange: (next: PeopleFilters) => void;
  /** Rows the counts are computed from (the full index, not the filtered result). */
  people: readonly PersonIndexRow[];
  facets?: Facet[];
  showSearch?: boolean;
  variant?: "page" | "map";
  className?: string;
};

export function FilterBar(_props: FilterBarProps) {
  return null;
}
