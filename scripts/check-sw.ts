/**
 * Post-build guard for the service worker (runs after `serwist build`).
 *   pnpm tsx scripts/check-sw.ts [public/sw.js]
 * Fails when the precache list has the same URL twice with different revisions: Serwist throws
 * add-to-cache-list-conflicting-entries at startup, the worker never installs, and the PWA
 * silently loses offline support (this shipped once with a duplicate /~offline entry).
 */
import { readFileSync } from "node:fs";

export function duplicatePrecacheUrls(sw: string): string[] {
  const seen = new Map<string, Set<string>>();
  for (const m of sw.matchAll(/\{revision:(null|"[^"]*"),url:"([^"]+)"\}/g)) {
    const revs = seen.get(m[2]!) ?? new Set<string>();
    revs.add(m[1]!);
    seen.set(m[2]!, revs);
  }
  return [...seen].filter(([, revs]) => revs.size > 1).map(([url]) => url);
}

if (process.argv[1]?.endsWith("check-sw.ts")) {
  const file = process.argv[2] ?? "public/sw.js";
  const sw = readFileSync(file, "utf8");
  const dups = duplicatePrecacheUrls(sw);
  if (!/url:"\/~offline"/.test(sw)) {
    console.error(`✗ ${file}: /~offline is not precached (offline fallback would be missing)`);
    process.exit(1);
  }
  if (dups.length) {
    console.error(`✗ ${file}: precached more than once with different revisions: ${dups.join(", ")}`);
    process.exit(1);
  }
  console.log(`✓ service worker precache: no conflicting entries, /~offline present`);
}
