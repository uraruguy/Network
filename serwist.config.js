import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { serwist } from "@serwist/next/config";

const revision = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() || crypto.randomUUID();

/** The status Next serves a prerendered page with: its sibling `.meta` file (no status means 200). */
const prerenderStatus = (htmlPath) => {
  const meta = htmlPath.replace(/\.html$/, ".meta");
  return existsSync(meta) ? (JSON.parse(readFileSync(meta, "utf8")).status ?? 200) : 200;
};

/**
 * @serwist/next precaches every prerendered `.html`, whatever status Next serves it with. Serwist
 * refuses a >= 400 response at install (bad-precaching-response), so a single 404 page fails the
 * whole install: no offline mode. /dev/ui is one (it calls notFound() in production). A redirect
 * (/ → /today) installs, but caches a copy of its target under a revision that doesn't follow the
 * target's changes. So precache only pages served with a 2xx. scripts/check-sw.ts re-checks this.
 */
const dropNon2xxPages = async (entries) => ({
  manifest: entries.filter((e) => {
    if (!e.url.endsWith(".html")) return true;
    const status = prerenderStatus(e.url);
    return status >= 200 && status < 300;
  }),
  warnings: [],
});

/**
 * The offline fallback must be precached exactly once. The build manifest normally includes the
 * prerendered page already (`…/~offline.html`; user transforms run before @serwist/next rewrites
 * build paths to URLs); a second `/~offline` entry with another revision makes Serwist throw at
 * startup (add-to-cache-list-conflicting-entries) and the worker never installs. So add it only
 * when the build didn't.
 */
const ensureOfflinePage = async (entries) => ({
  manifest: entries.some((e) => /(^|\/)~offline(\.html)?$/.test(e.url)) ? entries : [...entries, { url: "/~offline", revision, size: 0 }],
  warnings: [],
});

export default serwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  manifestTransforms: [dropNon2xxPages, ensureOfflinePage],
  // Keeps build output under api/ out of the precache manifest. This does NOT govern runtime
  // requests: the NetworkOnly rules in src/app/sw.ts keep /api, /auth, /oauth, /r, /login and
  // Supabase out of Cache Storage.
  globIgnores: ["**/api/**"],
});
