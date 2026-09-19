"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Renders children only after hydration. All app data is client-fetched (and restored from
 * IndexedDB), so SSR-ing page bodies only produces hydration mismatches. The shell chrome still SSRs.
 */
export function Hydrated({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return <>{mounted ? children : fallback}</>;
}
