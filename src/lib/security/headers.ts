import { CSP_HEADER, reportingEndpoints, serializeCsp, staticCsp, type CspOptions } from "./csp";

/**
 * Response headers for every route (wired up in next.config.ts `headers()`). Pure, so it can be
 * unit-tested and read without booting Next.
 */

export type Header = { key: string; value: string };

export const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  // Passkeys: allowed for our own origin only (never for embedded third parties).
  "publickey-credentials-get=(self)",
  "publickey-credentials-create=(self)",
].join(", ");

/** Baseline headers for all responses. HSTS only in production (it would pin https on localhost). */
export function baseSecurityHeaders({ production }: { production: boolean }): Header[] {
  return [
    ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    // A private app: nothing here belongs in a search index.
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
  ];
}

/** The static CSP (+ its reporting endpoint) for routes that don't get the proxy's nonce policy. */
export function staticCspHeaders(opts: CspOptions): Header[] {
  return [
    { key: CSP_HEADER, value: serializeCsp(staticCsp(opts)) },
    { key: "Reporting-Endpoints", value: reportingEndpoints() },
  ];
}
