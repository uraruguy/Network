/**
 * Route classes for the auth proxy (src/proxy.ts). Pure and unit-tested.
 *
 * - public    no session needed (sign-in pages, PWA plumbing, static files)
 * - machine   proxy skips auth entirely; the handler authenticates the caller itself
 *             (bearer tokens, cron secret, signed e-mail links, OAuth metadata)
 * - mfa-step  needs a password session but not yet the passkey (the passkey ceremony itself)
 * - page      app pages: full session (password + passkey), otherwise redirect to sign-in
 * - api       app API: full session, otherwise a JSON 401
 *
 * Anything not matched explicitly falls through to `page` / `api`, so new routes are protected by
 * default. Matching is per path segment ("/login/verify" never matches "/login/verifyx").
 */
export type RouteClass = "public" | "machine" | "mfa-step" | "page" | "api";

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

/** `prefix` itself or anything below it. */
const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(prefix + "/");

const MFA_STEP: RegExp[] = [/^\/login\/verify(\/.*)?$/, /^\/api\/auth\/webauthn(\/.*)?$/, /^\/api\/auth\/recovery$/];

const MACHINE: RegExp[] = [
  /^\/api\/mcp(\/.*)?$/,
  /^\/api\/inbox$/, // iPhone Shortcut capture (bearer token). NOT /api/inbox/owner/*, which is the app's own API.
  /^\/api\/cron(\/.*)?$/,
  /^\/\.well-known(\/.*)?$/,
  /^\/r(\/.*)?$/, // signed one-click links from e-mails
  new RegExp(`^/api/reminders/${UUID}/(done|snooze)$`), // signed digest actions (HMAC in the query string)
];

const PUBLIC_EXACT = new Set(["/login", "/manifest.webmanifest", "/sw.js", "/~offline", "/robots.txt", "/favicon.ico"]);
const PUBLIC_PREFIXES = ["/auth", "/_next", "/icons", "/data"];
/** Root-level files served from public/ (e.g. /sw.js.map, /apple-touch-icon.png). */
const ROOT_STATIC = /^\/[\w.-]+\.(?:png|svg|ico|jpe?g|webp|gif|txt|xml|webmanifest|js|map|css|woff2?)$/;

export function classify(pathname: string): RouteClass {
  if (MFA_STEP.some((r) => r.test(pathname))) return "mfa-step";
  if (MACHINE.some((r) => r.test(pathname))) return "machine";
  if (PUBLIC_EXACT.has(pathname) || under(pathname, "/login") || PUBLIC_PREFIXES.some((p) => under(pathname, p)) || ROOT_STATIC.test(pathname)) {
    return "public";
  }
  return under(pathname, "/api") ? "api" : "page";
}

/** The sign-in page and its siblings (except the passkey step). */
export function isLoginPage(pathname: string): boolean {
  return under(pathname, "/login") && classify(pathname) === "public";
}
