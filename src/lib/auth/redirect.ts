export const DEFAULT_AFTER_LOGIN = "/today";

/**
 * Sanitises a post-login `next` target into a same-origin path (path + query + hash).
 *
 * Rejects anything that could leave the origin: absolute URLs, protocol-relative `//host`,
 * backslash tricks (`/\host`, which browsers treat as `//host`), control characters and
 * whitespace (browsers strip tabs/newlines, turning `/\t/host` into `//host`). Also refuses to
 * bounce back into the sign-in flow. Falls back to `fallback` (default /today).
 */
export function safeNext(next: string | null | undefined, origin: string, fallback = DEFAULT_AFTER_LOGIN): string {
  if (!next || typeof next !== "string" || next.length > 2048) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f\s]/.test(next)) return fallback;

  let url: URL;
  let base: URL;
  try {
    base = new URL(origin);
    url = new URL(next, base);
  } catch {
    return fallback;
  }
  if (url.origin !== base.origin) return fallback;
  if (url.pathname === "/login" || url.pathname.startsWith("/login/") || url.pathname.startsWith("/auth/")) return fallback;
  return url.pathname + url.search + url.hash;
}
