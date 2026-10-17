import { createHash, randomBytes } from "node:crypto";

/**
 * Content Security Policy builders, shared by next.config.ts (static policy), the proxy (nonce
 * policy) and tests. Pure and dependency-free on purpose: next.config.ts imports this file before
 * the app's env/aliases exist.
 *
 * Two policies (see SECURITY.md for the trade-off):
 *
 *   static  Every app page and API response. Pages stay statically rendered, prefetchable and
 *           available offline from the service worker, so the policy can't carry a per-request
 *           nonce and needs 'unsafe-inline' for Next's inline RSC payload scripts.
 *
 *   nonce   The sign-in surface only (/login, /login/verify, /login/reset, /oauth/consent). These
 *           pages render per request anyway (`await connection()`), so the proxy issues a fresh
 *           nonce: `'nonce-…' 'strict-dynamic'` — no 'unsafe-inline' scripts where passwords and
 *           passkeys are entered. Our one inline script (the pre-paint theme script in the root
 *           layout) is allowed by its SHA-256 hash, so the shared layout stays static.
 *
 * Both ship as `Content-Security-Policy-Report-Only` first; flip CSP_REPORT_ONLY once
 * /api/csp-report stays quiet in production.
 */

export type CspDirectives = Record<string, string[]>;

/** Report-only until violations have been reviewed in production. */
export const CSP_REPORT_ONLY = true;
export const CSP_HEADER = CSP_REPORT_ONLY ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";

export const CSP_REPORT_PATH = "/api/csp-report";
/** Group name for the Reporting API (`report-to`), declared via the Reporting-Endpoints header. */
export const CSP_REPORT_GROUP = "csp";

/** Vector tiles, glyphs and sprites for the map (also cached by the service worker). */
export const MAP_TILES_ORIGIN = "https://tiles.openfreemap.org";

/** Pages that get the strict nonce policy (whole path segments: /login covers /login/verify). */
export const NONCE_PAGE_PREFIXES = ["/login", "/oauth/consent"] as const;

export function usesNonceCsp(pathname: string): boolean {
  return NONCE_PAGE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export type CspOptions = {
  /** NEXT_PUBLIC_SUPABASE_URL — the browser talks to Supabase Auth directly. */
  supabaseUrl?: string | null;
  /** Development: allows 'unsafe-eval' (React dev tooling) and HMR websockets. */
  dev?: boolean;
  /** Where browsers POST violation reports; null disables reporting. */
  reportUri?: string | null;
};

function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function baseDirectives({ supabaseUrl, dev = false, reportUri = CSP_REPORT_PATH }: CspOptions): CspDirectives {
  const supabase = originOf(supabaseUrl);
  const d: CspDirectives = {
    "default-src": ["'self'"],
    "script-src": ["'self'"],
    "style-src": ["'self'", "'unsafe-inline'"], // inline style attributes (Motion, Base UI positioning)
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(supabase ? [supabase] : []), MAP_TILES_ORIGIN, ...(dev ? ["ws:"] : [])],
    "worker-src": ["'self'", "blob:"], // service worker + MapLibre's blob workers
    "child-src": ["blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
  };
  // Upgrading would break plain-http local development (Supabase on 127.0.0.1).
  if (!dev) d["upgrade-insecure-requests"] = [];
  if (reportUri) {
    d["report-uri"] = [reportUri];
    d["report-to"] = [CSP_REPORT_GROUP];
  }
  return d;
}

/** The policy for statically rendered pages and API responses (set in next.config.ts). */
export function staticCsp(opts: CspOptions = {}): CspDirectives {
  const d = baseDirectives(opts);
  d["script-src"] = ["'self'", "'unsafe-inline'", ...(opts.dev ? ["'unsafe-eval'"] : [])];
  return d;
}

/**
 * The per-request policy for the sign-in pages. `inlineScriptHashes` are `'sha256-…'` sources
 * (see `scriptHash`) for inline scripts rendered without the nonce. 'self' is only a fallback
 * for browsers without 'strict-dynamic'.
 */
export function nonceCsp(nonce: string, opts: CspOptions & { inlineScriptHashes?: string[] } = {}): CspDirectives {
  if (!/^[A-Za-z0-9+/=_-]{16,}$/.test(nonce)) throw new Error("Invalid CSP nonce");
  const d = baseDirectives(opts);
  d["script-src"] = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(opts.inlineScriptHashes ?? []), ...(opts.dev ? ["'unsafe-eval'"] : [])];
  return d;
}

/** Serialises directives into a header value (`a b; c d; e`). */
export function serializeCsp(directives: CspDirectives): string {
  return Object.entries(directives)
    .map(([name, values]) => [name, ...values].join(" "))
    .join("; ");
}

/** A fresh, unguessable nonce (128 bits, base64). */
export function generateNonce(): string {
  return randomBytes(16).toString("base64");
}

/** CSP hash source for an inline script's exact text. */
export function scriptHash(source: string): string {
  return `'sha256-${createHash("sha256").update(source, "utf8").digest("base64")}'`;
}

/** `Reporting-Endpoints` header value pairing `report-to csp` with the report URL. */
export function reportingEndpoints(reportUri: string = CSP_REPORT_PATH): string {
  return `${CSP_REPORT_GROUP}="${reportUri}"`;
}
