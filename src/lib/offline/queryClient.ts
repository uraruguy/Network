"use client";
import { defaultShouldDehydrateQuery, QueryClient, type Mutation, type Query } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { PersistedClient, Persister, PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";

// Bump when cached API shapes change incompatibly (v2: people index, note excerpts, activities).
// Bumping drops the whole persisted cache — including writes still queued offline — so additive
// fields (e.g. a note's `baseVersions`) don't bump it.
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
 * Key roots that never reach IndexedDB, whatever a query's meta says: chat transcripts, the
 * security overview, connected apps (token list) and geocoder lookups. Search results
 * (`[root, "search", …]`) are volatile and never persisted either.
 */
const NEVER_PERSIST = new Set(["chat", "security", "connected-apps", "cities"]);

/**
 * Which queries reach IndexedDB: every successful query unless its key is excluded above or it
 * opts out with `meta: { persist: false }` (large, volatile or sensitive data).
 */
export function shouldPersistQuery(query: Pick<Query, "queryKey" | "meta" | "state">): boolean {
  const [root, sub] = query.queryKey;
  if (NEVER_PERSIST.has(String(root)) || sub === "search") return false;
  return query.meta?.persist !== false && defaultShouldDehydrateQuery(query as Query);
}

/**
 * Writes that can be sent again when their outcome is unknown (idempotent: client ids, PUTs,
 * PATCHes, deletes). Completing a follow-up is not — a repeat would skip a recurrence.
 */
export function isReplayableWrite(mutationKey: readonly unknown[] | undefined, variables: unknown): boolean {
  const [root, op] = mutationKey ?? [];
  switch (root) {
    case "notes":
    case "people":
    case "activities":
    case "settings":
    case "chat":
      return true;
    case "reminders":
      return op !== "action" || (variables as { action?: unknown } | undefined)?.action !== "done";
    default:
      return false;
  }
}

/**
 * Paused (offline) writes are persisted so they survive a reload — and so are replayable writes
 * still in flight, which a closing tab would otherwise lose (see `resumeInFlight`).
 */
export function shouldPersistMutation(m: Pick<Mutation, "state" | "options">): boolean {
  return m.state.isPaused || (m.state.status === "pending" && isReplayableWrite(m.options.mutationKey, m.state.variables));
}

/** Restored writes that were in flight when the page went away resume like paused ones. */
export function resumeInFlight(client: PersistedClient): PersistedClient {
  const mutations = client.clientState.mutations.map((m) => (m.state.status === "pending" && !m.state.isPaused ? { ...m, state: { ...m.state, isPaused: true } } : m));
  return { ...client, clientState: { ...client.clientState, mutations } };
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

let flushActive: (() => Promise<void>) | null = null;

/**
 * Writes the newest cache snapshot to IndexedDB right away, skipping the throttle — call on
 * pagehide / tab hidden so a just-queued save (and its `syncPending` flag) is on disk before the
 * page may be killed. No-op until the persisted cache has been restored.
 */
export function flushPersistedCache(): Promise<void> {
  return flushActive?.() ?? Promise.resolve();
}

export function makePersister(): Persister & { flush: () => Promise<void> } {
  const key = `the-network-cache-${CACHE_VERSION}`;
  const persister = createAsyncStoragePersister({
    storage: {
      getItem: (k) => get(k),
      setItem: (k, value) => set(k, value),
      removeItem: (k) => del(k),
    },
    key,
    throttleTime: PERSIST_THROTTLE_MS,
  });
  // The subscriber hands every snapshot to persistClient synchronously; the throttle may sit on it.
  let latest: PersistedClient | null = null;
  const flush = async () => {
    if (latest) await set(key, JSON.stringify(latest));
  };
  flushActive = flush;
  return {
    persistClient: (client) => {
      latest = client;
      return persister.persistClient(client);
    },
    restoreClient: async () => {
      await afterHydration();
      const client = await persister.restoreClient();
      return client ? resumeInFlight(client) : client;
    },
    removeClient: () => persister.removeClient(),
    flush,
  };
}

/** Everything `PersistQueryClientProvider` needs besides the client. */
export function makePersistOptions(): Omit<PersistQueryClientOptions, "queryClient"> {
  return {
    persister: makePersister(),
    buster: CACHE_VERSION,
    maxAge: PERSIST_MAX_AGE,
    dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery, shouldDehydrateMutation: shouldPersistMutation },
  };
}
