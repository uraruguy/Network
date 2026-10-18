/**
 * Whether the app registers its service worker. Always in production builds; in `next dev` only
 * when NEXT_PUBLIC_SW_DEV=1 (`pnpm dev:sw`). A worker controlling a dev page caches dev chunks
 * and fights Fast Refresh: every rebuild ends in a full reload, so the page reloads in a loop.
 */
export function serviceWorkerEnabled(env: { NODE_ENV?: string; NEXT_PUBLIC_SW_DEV?: string } = process.env): boolean {
  return env.NODE_ENV !== "development" || env.NEXT_PUBLIC_SW_DEV === "1";
}
