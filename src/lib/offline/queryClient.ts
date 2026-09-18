"use client";
import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { del, get, set } from "idb-keyval";

export const CACHE_VERSION = "v1";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data is single-user and rarely changes under us: keep it fresh-ish but serve cache instantly.
        staleTime: 30_000,
        gcTime: 1000 * 60 * 60 * 24 * 14, // keep 2 weeks offline
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

export function makePersister() {
  return createAsyncStoragePersister({
    storage: {
      getItem: (key) => get(key),
      setItem: (key, value) => set(key, value),
      removeItem: (key) => del(key),
    },
    key: `the-network-cache-${CACHE_VERSION}`,
    throttleTime: 1000,
  });
}
