/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { CacheFirst, CacheableResponsePlugin, ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

/**
 * Same-origin paths that must always hit the network and never land in Cache Storage:
 * private API data (the offline copy lives in the TanStack Query cache, which sign-out wipes),
 * auth callbacks, OAuth, signed e-mail links and the sign-in pages (per-request CSP nonces).
 */
const NETWORK_ONLY_PREFIXES = ["/api/", "/auth/", "/oauth/", "/r/"];
const isNetworkOnlyPath = (pathname: string) =>
  NETWORK_ONLY_PREFIXES.some((p) => pathname.startsWith(p)) || pathname === "/login" || pathname.startsWith("/login/");

const MAP_TILES_ORIGIN = "https://tiles.openfreemap.org";
const DAY = 24 * 60 * 60;

/** Our rules run first; Serwist's Next.js defaults (static assets, pages) handle the rest. */
const runtimeCaching: RuntimeCaching[] = [
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && isNetworkOnlyPath(url.pathname),
    handler: new NetworkOnly(),
  },
  {
    // Supabase Auth (tokens, user) — never cached.
    matcher: ({ url }) => url.hostname === "supabase.co" || url.hostname.endsWith(".supabase.co"),
    handler: new NetworkOnly(),
  },
  {
    // Map tiles, glyphs and sprites: versioned, immutable URLs → cache first, keep a month.
    matcher: ({ url }) => url.origin === MAP_TILES_ORIGIN && /\.(?:pbf|mvt|png|webp|json)$/i.test(url.pathname),
    handler: new CacheFirst({
      cacheName: "map-tiles",
      plugins: [
        new CacheableResponsePlugin({ statuses: [200] }),
        new ExpirationPlugin({ maxEntries: 3000, maxAgeSeconds: 30 * DAY, maxAgeFrom: "last-used" }),
      ],
    }),
  },
  {
    // Style + TileJSON documents point at the current tile version: refresh in the background.
    matcher: ({ url }) => url.origin === MAP_TILES_ORIGIN,
    handler: new StaleWhileRevalidate({
      cacheName: "map-styles",
      plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 30 * DAY })],
    }),
  },
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
