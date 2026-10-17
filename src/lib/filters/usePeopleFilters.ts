"use client";
/**
 * URL-synced people filters: `?q=&cat=&w=&act=&tag=&city=` (+ `?sort=` via `usePeopleSort`).
 *
 * Local state is the source of truth while mounted, so typing and toggling never wait for the
 * router; the URL mirrors it (search after ~300ms, facets at once) and back/forward or links that
 * change the params flow back in. URLs are written with `history.replaceState` (Next's shallow
 * routing — it updates `useSearchParams` without an RSC round-trip, so it works offline and
 * never scrolls), and never add history entries.
 */
import { useSearchParams } from "next/navigation";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DEFAULT_SORT, parseSort, type SortKey } from "./sort";
import { clearFacets, FILTER_PARAM_NAMES, filtersFromParams, filtersToParams, sameFacets, searchString, type PeopleFilters } from "./people-filters";

/** Search keystrokes reach the URL after this pause (also keeps Safari's replaceState rate limit happy). */
export const QUERY_URL_DELAY = 300;

export type PeopleFiltersState = {
  /** Current filters. Search updates urgently; facet changes render in a transition. */
  filters: PeopleFilters;
  /** Replace the filters (a search-only change is written to the URL after ~300ms, facets at once). */
  setFilters: (next: PeopleFilters | ((prev: PeopleFilters) => PeopleFilters)) => void;
  setQuery: (q: string) => void;
  /** Clear every facet; the search too unless `keepQuery`. */
  clear: (opts?: { keepQuery?: boolean }) => void;
  /** A facet change is still rendering. */
  isPending: boolean;
};

/** Canonical string of the filter params only (other params like `sort`/`new` don't count). */
const keyOf = (f: PeopleFilters) => filtersToParams(f).toString();

/** Replace params on the current URL without a navigation (shallow; keeps unrelated params and the hash). */
export function replaceSearchParams(mutate: (params: URLSearchParams) => void) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  mutate(params);
  const next = `${window.location.pathname}${searchString(params)}${window.location.hash}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, "", next);
}

export function usePeopleFilters(): PeopleFiltersState {
  const searchParams = useSearchParams();
  const urlFilters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const urlKey = keyOf(urlFilters);

  const [q, setQ] = useState(urlFilters.q);
  const [facets, setFacets] = useState(urlFilters);
  const [isPending, startFacetTransition] = useTransition();
  /** Last URL key seen, and the last key this hook wrote: a URL change that isn't our own echo came from outside. */
  const [seenKey, setSeenKey] = useState(urlKey);
  const [writtenKey, setWrittenKey] = useState(urlKey);

  /** Latest intended filters (ahead of render while a facet transition is pending) — base for functional updates. */
  const latest = useRef(urlFilters);
  const [adopted, setAdopted] = useState<PeopleFilters | null>(null);

  // Back/forward, or a link to /people?cat=… while mounted: adopt the URL (render-phase sync, no effect lag).
  if (urlKey !== seenKey) {
    setSeenKey(urlKey);
    if (urlKey !== writtenKey) {
      setWrittenKey(urlKey);
      setQ(urlFilters.q);
      setFacets(urlFilters);
      setAdopted(urlFilters);
    }
  }
  useEffect(() => {
    if (adopted) latest.current = adopted;
  }, [adopted]);

  const filters = useMemo<PeopleFilters>(() => ({ ...facets, q }), [facets, q]);

  // Mirror state → URL. Facet changes go out immediately; a search-only change waits for a typing pause.
  const targetKey = keyOf(filters);
  const facetsChanged = !sameFacets(filters, urlFilters);
  useEffect(() => {
    if (targetKey === urlKey) return;
    const write = () => {
      cleanup();
      setWrittenKey(targetKey);
      replaceSearchParams((params) => {
        for (const name of FILTER_PARAM_NAMES) params.delete(name);
        new URLSearchParams(targetKey).forEach((v, k) => params.set(k, v));
      });
    };
    // Navigating away mid-debounce (tapping a result) must not lose the search: flush on the first press.
    const timer = setTimeout(write, facetsChanged ? 0 : QUERY_URL_DELAY);
    document.addEventListener("pointerdown", write, true);
    window.addEventListener("pagehide", write);
    function cleanup() {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", write, true);
      window.removeEventListener("pagehide", write);
    }
    return cleanup;
  }, [targetKey, urlKey, facetsChanged]);

  const setFilters = useCallback<PeopleFiltersState["setFilters"]>((next) => {
    const prev = latest.current;
    const value = typeof next === "function" ? next(prev) : next;
    latest.current = value;
    if (value.q !== prev.q) setQ(value.q);
    if (!sameFacets(value, prev)) startFacetTransition(() => setFacets(value));
  }, []);

  const setQuery = useCallback((value: string) => setFilters((f) => ({ ...f, q: value })), [setFilters]);
  const clear = useCallback<PeopleFiltersState["clear"]>((opts) => setFilters((f) => clearFacets(f, opts?.keepQuery ?? false)), [setFilters]);

  return { filters, setFilters, setQuery, clear, isPending };
}

/** `?sort=` for the people list (default "recent" is omitted from the URL). */
export function usePeopleSort(): [SortKey, (sort: SortKey) => void] {
  const searchParams = useSearchParams();
  const urlSort = parseSort(searchParams.get("sort"));
  const [sort, setSortState] = useState(urlSort);
  const [seen, setSeen] = useState(urlSort);
  if (urlSort !== seen) {
    setSeen(urlSort);
    setSortState(urlSort);
  }
  const setSort = useCallback((next: SortKey) => {
    startTransition(() => setSortState(next));
    replaceSearchParams((params) => {
      if (next === DEFAULT_SORT) params.delete("sort");
      else params.set("sort", next);
    });
  }, []);
  return [sort, setSort];
}
