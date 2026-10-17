"use client";
import { useSyncExternalStore } from "react";

/** Breakpoints (px) — mirror Tailwind's defaults used across the app. */
export const BREAKPOINTS = { sm: 640, md: 768, lg: 1024 } as const;

export const MQ = {
  /** Phone layout: bottom sheets, action sheets. */
  phone: `(max-width: ${BREAKPOINTS.sm - 0.02}px)`,
  /** Below the sidebar breakpoint (tab bar visible). */
  belowLg: `(max-width: ${BREAKPOINTS.lg - 0.02}px)`,
  coarse: "(pointer: coarse)",
  hover: "(hover: hover) and (pointer: fine)",
  reducedMotion: "(prefers-reduced-motion: reduce)",
} as const;

const cache = new Map<string, { mql: MediaQueryList; subscribe: (cb: () => void) => () => void; get: () => boolean }>();

function store(query: string) {
  let s = cache.get(query);
  if (!s) {
    const mql = window.matchMedia(query);
    s = {
      mql,
      subscribe: (cb) => {
        mql.addEventListener("change", cb);
        return () => mql.removeEventListener("change", cb);
      },
      get: () => mql.matches,
    };
    cache.set(query, s);
  }
  return s;
}

const noopSubscribe = () => () => {};

/**
 * Live media-query match. `serverValue` is used during SSR and hydration (default false);
 * components mounted after hydration read the real value on first render.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const s = typeof window === "undefined" ? null : store(query);
  return useSyncExternalStore(
    s ? s.subscribe : noopSubscribe,
    s ? s.get : () => serverValue,
    () => serverValue,
  );
}

/** < 640px — phones in portrait. */
export const useIsPhone = () => useMediaQuery(MQ.phone);
/** Primary pointer is a finger. */
export const useCoarsePointer = () => useMediaQuery(MQ.coarse);
/** Mouse/trackpad with hover. */
export const useCanHover = () => useMediaQuery(MQ.hover);
