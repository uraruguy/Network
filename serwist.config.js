import { spawnSync } from "node:child_process";
import { serwist } from "@serwist/next/config";

const revision = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() || crypto.randomUUID();

export default serwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
  // Keeps build output under api/ out of the precache manifest. This does NOT govern runtime
  // requests: the NetworkOnly rules in src/app/sw.ts keep /api, /auth, /oauth, /r, /login and
  // Supabase out of Cache Storage.
  globIgnores: ["**/api/**"],
});
