"use client";
import { defaultShouldDehydrateQuery, QueryClient, type Query } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";

// Bump when cached API shapes change incompatibly (v2: people index, note excerpts, activities).
export const CACHE_VERSION = "v2";

/** How long a persisted cache stays usable offline. */
export const PERSIST_MAX_AGE = 1000 * 60 * 60 * 24 * 14;

/** Writes to IndexedDB are coalesced: at most one serialisation of the whole cache per window. */
export const PERSIST_THROTTLE_MS = 2000;

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data is single-user and rarely changes under us: keep it fresh-ish but serve cache instantly.
        staleTime: 30_000,
        gcTime: PERSIST_MAX_AGE, // keep 2 weeks offline
        retry: 1,
        refetchOnWindowFocus: true,
        networkMode: "offlineFirst",
      },
      mutations: {
        networkMode: "offlineFirst",
        retry: 3,
      },
    },
  });
}

/**
 * Which queries reach IndexedDB: every successful query unless it opts out with
 * `meta: { persist: false }` (large, volatile or sensitive data — chat transcripts, search
 * results, geocoder lookups…). Paused mutations are always persisted (TanStack default) so
 * offline writes survive a reload.
 */
export function shouldPersistQuery(query: Query): boolean {
  return query.meta?.persist !== false && defaultShouldDehydrateQuery(query);
}

/**
 * Resolves once the main thread goes idle after start-up — i.e. after React has hydrated every
 * Suspense boundary (each loading.tsx adds one, and they hydrate in later tasks than the root).
 * Restoring before that would let a late boundary hydrate with data the server HTML didn't have.
 */
function afterHydration(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(() => resolve(), { timeout: 300 });
    else requestAnimationFrame(() => setTimeout(resolve, 16));
  });
}

export function makePersister() {
  const persister = createAsyncStoragePersister({
    storage: {
      getItem: (key) => get(key),
      setItem: (key, value) => set(key, value),
      removeItem: (key) => del(key),
    },
    key: `the-network-cache-${CACHE_VERSION}`,
    throttleTime: PERSIST_THROTTLE_MS,
  });
  return {
    ...persister,
    restoreClient: async () => {
      await afterHydration();
      return persister.restoreClient();
    },
  };
}

/** Everything `PersistQueryClientProvider` needs besides the client. */
export function makePersistOptions(): Omit<PersistQueryClientOptions, "queryClient"> {
  return {
    persister: makePersister(),
    buster: CACHE_VERSION,
    maxAge: PERSIST_MAX_AGE,
    dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
  };
}
