"use client";
/**
 * People-list reads layered on the cached index: the filtered + sorted list (instant, offline)
 * and the "In notes" full-text search shown under it.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { filterPeople, isEmpty, type PeopleFilters } from "@/lib/filters/people-filters";
import { sortPeople, type SortKey } from "@/lib/filters/sort";
import { keys } from "./keys";
import { usePeopleIndex } from "./people";
import type { NoteSearchHit, PersonIndexRow } from "./types";

const NO_PEOPLE: PersonIndexRow[] = [];

/** `value`, updated only after it has been stable for `delay` ms. */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * The people list for `filters` + `sort`, computed from the cached index off the urgent path
 * (`useDeferredValue`), so typing stays instant even with thousands of rows.
 */
export function usePeopleList(filters: PeopleFilters, sort: SortKey) {
  const index = usePeopleIndex();
  const all = index.data ?? NO_PEOPLE;
  const deferredFilters = useDeferredValue(filters);
  const deferredSort = useDeferredValue(sort);
  const rows = useMemo(() => sortPeople(filterPeople(all, deferredFilters), deferredSort, deferredFilters.q), [all, deferredFilters, deferredSort]);
  const cityCount = useMemo(() => new Set(rows.flatMap((p) => (p.homeLocation ? [p.homeLocation.id] : []))).size, [rows]);
  return {
    /** Every person (facet counts are computed from this). */
    all,
    rows,
    cityCount,
    filtered: !isEmpty(deferredFilters),
    /** The visible rows still reflect older filters/sort. */
    isStale: deferredFilters !== filters || deferredSort !== sort,
    /** Nothing to show yet (cache restoring or first fetch). */
    isPending: index.isPending,
    isError: index.isError,
    refetch: index.refetch,
  };
}

export const NOTE_SEARCH_MIN = 2;

/**
 * Note hits for the people search box: debounced 250ms, keeps the previous hits while typing,
 * and is never persisted offline (short gcTime, `meta.persist = false`).
 */
export function usePeopleNoteSearch(query: string, { limit = 20 }: { limit?: number } = {}) {
  const q = useDebouncedValue(query.trim(), 250);
  const enabled = q.length >= NOTE_SEARCH_MIN;
  const result = useQuery({
    queryKey: keys.noteSearch(q),
    queryFn: () => api.get<NoteSearchHit[]>(`/api/notes?${new URLSearchParams({ q, limit: String(limit) })}`),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    gcTime: 60_000,
    retry: false,
    meta: { persist: false },
  });
  return {
    ...result,
    /** The debounced query the hits belong to. */
    query: q,
    hits: enabled ? (result.data ?? []) : [],
    /** The input is ahead of the hits (debouncing or fetching). */
    isUpdating: enabled && (q !== query.trim() || result.isFetching),
  };
}
