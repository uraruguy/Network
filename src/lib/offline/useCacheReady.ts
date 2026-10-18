"use client";
import { useIsRestoring } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * True once cached data may be rendered: after hydration AND after the IndexedDB restore.
 *
 * Why hydration matters: Suspense boundaries (every loading.tsx adds one) can hydrate after the
 * restore has finished. Their hydration render would then see restored data the server never had
 * → hydration mismatch. During hydration this returns false (server snapshot), so the boundary
 * renders the same skeleton the server sent and switches to data right after.
 *
 *   const index = usePeopleIndex();
 *   const ready = useQueryReady(index);
 *   const people = ready ? index.data : undefined; // derive EVERYTHING (counts, labels) from this
 *   if (!ready) return <PeopleListSkeleton header={false} />;
 */
export function useCacheReady(): boolean {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const restoring = useIsRestoring();
  return hydrated && !restoring;
}

/** `useCacheReady()` + "this query has something to show" — the skeleton switch for one query. */
export function useQueryReady(query: { data: unknown; isPending: boolean }): boolean {
  const ready = useCacheReady();
  return ready && !(query.isPending && query.data === undefined);
}

/**
 * A query's data, held back (undefined) until cached data may render — for UI that shows
 * placeholders rather than a skeleton: `const profile = useReadyData(useProfile());`
 */
export function useReadyData<T>(query: { data: T | undefined }): T | undefined {
  return useCacheReady() ? query.data : undefined;
}
