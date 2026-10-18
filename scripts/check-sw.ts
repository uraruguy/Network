/**
 * Post-build guard for the service worker (runs after `serwist build`).
 *   pnpm tsx scripts/check-sw.ts [public/sw.js]
 * Fails on precache problems that silently cost the PWA its offline support:
 * - the same URL precached twice with different revisions: Serwist throws
 *   add-to-cache-list-conflicting-entries at startup (this shipped once with /~offline);
 * - a precached page that Next prerendered with a non-2xx status: Serwist refuses a >= 400
 *   response at install (bad-precaching-response; this shipped with /dev/ui, a 404 in production),
 *   and a redirect caches its target under a revision that doesn't follow it. serwist.config.js
 *   drops these; this re-checks the result.
 */
import { existsSync, readFileSync } from "node:fs";

const ENTRY = /\{revision:(null|"[^"]*"),url:"([^"]+)"\}/g;

export const precacheEntries = (sw: string) => [...sw.matchAll(ENTRY)].map((m) => ({ revision: m[1]!, url: m[2]! }));

export function duplicatePrecacheUrls(sw: string): string[] {
  const seen = new Map<string, Set<string>>();
  for (const { url, revision } of precacheEntries(sw)) seen.set(url, (seen.get(url) ?? new Set()).add(revision));
  return [...seen].filter(([, revs]) => revs.size > 1).map(([url]) => url);
}

/** Where Next records the status of a prerendered page ("/" is `index`). */
export const prerenderMetaPath = (url: string, appDir = ".next/server/app") => `${appDir}${url === "/" ? "/index" : url}.meta`;

/** Precached URLs whose prerendered status (undefined: not a prerendered page) is not 2xx. */
export function non2xxPrecachedPages(sw: string, statusOf: (url: string) => number | undefined): { url: string; status: number }[] {
  const urls = new Set(precacheEntries(sw).map((e) => e.url));
  return [...urls].flatMap((url) => {
    const status = statusOf(url);
    return status !== undefined && (status < 200 || status >= 300) ? [{ url, status }] : [];
  });
}

if (process.argv[1]?.endsWith("check-sw.ts")) {
  const file = process.argv[2] ?? "public/sw.js";
  const sw = readFileSync(file, "utf8");
  const fail = (msg: string) => {
    console.error(`✗ ${file}: ${msg}`);
    process.exit(1);
  };
  // Entries only: the fallbacks config in sw.ts also contains `url:"/~offline"`.
  if (!precacheEntries(sw).some((e) => e.url === "/~offline")) fail("/~offline is not precached (offline fallback would be missing)");
  const dups = duplicatePrecacheUrls(sw);
  if (dups.length) fail(`precached more than once with different revisions: ${dups.join(", ")}`);
  const statusOf = (url: string) => {
    const meta = prerenderMetaPath(url);
    return existsSync(meta) ? ((JSON.parse(readFileSync(meta, "utf8")) as { status?: number }).status ?? 200) : undefined;
  };
  const bad = non2xxPrecachedPages(sw, statusOf);
  if (bad.length) fail(`precached pages prerendered with a non-2xx status (see dropNon2xxPages in serwist.config.js): ${bad.map((b) => `${b.url} ${b.status}`).join(", ")}`);
  console.log(`✓ service worker precache: ${precacheEntries(sw).length} entries, no conflicts, /~offline present, every precached page 2xx`);
}
