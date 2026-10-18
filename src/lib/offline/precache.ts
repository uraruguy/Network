import type { SerwistPlugin } from "serwist";

/**
 * Precache guard for the service worker (src/app/sw.ts): an entry may only hold what its own URL
 * answered, directly and with a 2xx.
 *
 * Without a session every app page answers 307 → /login. The install's fetch follows the redirect,
 * and Serwist's built-in copyRedirectedCacheableResponsesPlugin would store the sign-in HTML under
 * /today, /people… — the install succeeds, and offline every page shows the sign-in form until a
 * deploy changes those revisions. Rejecting the response fails the install instead (Serwist throws
 * `bad-precaching-response`): a first install leaves no worker, an update leaves the current one
 * active, and the next registration from a signed-in page installs the real pages.
 *
 * Serwist adds its default cacheability check (status < 400) only when no plugin defines
 * `cacheWillUpdate`, so this one has to reject error statuses itself.
 */
export const isPrecacheable = (response: Pick<Response, "ok" | "redirected">) => response.ok && !response.redirected;

export const directResponsesOnly: SerwistPlugin = {
  cacheWillUpdate: async ({ response }) => (isPrecacheable(response) ? response : null),
};
