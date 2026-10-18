"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * false during the server render and hydration, true afterwards (and on every client-only
 * mount). Use it ONLY for text that depends on the device clock or locale — a greeting, today's
 * date — so the server HTML and the first client render agree:
 *
 *   const hydrated = useHydrated();
 *   <h1>{hydrated ? greeting(now) : <span className="invisible">Good evening</span>}</h1>
 *
 * Data-driven UI doesn't need it: the query cache is empty on the server and during the
 * IndexedDB restore, so both render the same skeletons.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
