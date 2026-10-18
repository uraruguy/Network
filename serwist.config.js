import { spawnSync } from "node:child_process";
import { serwist } from "@serwist/next/config";

const revision = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() || crypto.randomUUID();

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
  manifestTransforms: [ensureOfflinePage],
  // Keeps build output under api/ out of the precache manifest. This does NOT govern runtime
  // requests: the NetworkOnly rules in src/app/sw.ts keep /api, /auth, /oauth, /r, /login and
  // Supabase out of Cache Storage.
  globIgnores: ["**/api/**"],
});
