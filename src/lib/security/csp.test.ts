import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CSP_HEADER, generateNonce, nonceCsp, reportingEndpoints, scriptHash, serializeCsp, staticCsp, usesNonceCsp } from "./csp";
import { baseSecurityHeaders, staticCspHeaders } from "./headers";
import { headInlineScript, THEME_SCRIPT } from "./inline-scripts";

const SUPABASE = "https://abcdefgh.supabase.co";

describe("staticCsp", () => {
  it("builds the production policy for static pages", () => {
    expect(serializeCsp(staticCsp({ supabaseUrl: SUPABASE }))).toBe(
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        `connect-src 'self' ${SUPABASE} https://tiles.openfreemap.org`,
        "worker-src 'self' blob:",
        "child-src blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "upgrade-insecure-requests",
        "report-uri /api/csp-report",
        "report-to csp",
      ].join("; "),
    );
  });

  it("uses the Supabase origin only (no path) and tolerates a missing/invalid URL", () => {
    expect(staticCsp({ supabaseUrl: `${SUPABASE}/auth/v1` })["connect-src"]).toContain(SUPABASE);
    expect(staticCsp({ supabaseUrl: "not a url" })["connect-src"]).toEqual(["'self'", "https://tiles.openfreemap.org"]);
    expect(staticCsp({})["connect-src"]).toEqual(["'self'", "https://tiles.openfreemap.org"]);
  });

  it("relaxes only what development needs", () => {
    const dev = staticCsp({ supabaseUrl: "http://127.0.0.1:54321", dev: true });
    expect(dev["script-src"]).toContain("'unsafe-eval'");
    expect(dev["connect-src"]).toEqual(["'self'", "http://127.0.0.1:54321", "https://tiles.openfreemap.org", "ws:"]);
    expect(dev).not.toHaveProperty("upgrade-insecure-requests");
    expect(staticCsp({})["script-src"]).not.toContain("'unsafe-eval'");
  });

  it("can disable reporting", () => {
    const d = staticCsp({ reportUri: null });
    expect(d).not.toHaveProperty("report-uri");
    expect(d).not.toHaveProperty("report-to");
  });
});

describe("nonceCsp", () => {
  it("replaces 'unsafe-inline' scripts with nonce + strict-dynamic + hashes", () => {
    const nonce = generateNonce();
    const hash = scriptHash("console.log(1)");
    const d = nonceCsp(nonce, { supabaseUrl: SUPABASE, inlineScriptHashes: [hash] });
    expect(d["script-src"]).toEqual(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", hash]);
    expect(d["script-src"]).not.toContain("'unsafe-inline'");
    // Everything else matches the static policy.
    const { "script-src": _a, ...rest } = d;
    const { "script-src": _b, ...staticRest } = staticCsp({ supabaseUrl: SUPABASE });
    expect(rest).toEqual(staticRest);
  });

  it("rejects nonces that could inject directives", () => {
    expect(() => nonceCsp("abc")).toThrow();
    expect(() => nonceCsp("aaaaaaaaaaaaaaaa'; script-src *")).toThrow();
    expect(() => nonceCsp("aaaaaaaaaaaaaaaa aaaa")).toThrow();
  });

  it("adds 'unsafe-eval' only in development", () => {
    expect(nonceCsp(generateNonce(), { dev: true })["script-src"]).toContain("'unsafe-eval'");
  });
});

describe("helpers", () => {
  it("generates unique 128-bit base64 nonces", () => {
    const a = generateNonce();
    expect(Buffer.from(a, "base64")).toHaveLength(16);
    expect(generateNonce()).not.toBe(a);
  });

  it("hashes inline scripts the way browsers do (sha256 over UTF-8, base64)", () => {
    const expected = createHash("sha256").update("alert('x')", "utf8").digest("base64");
    expect(scriptHash("alert('x')")).toBe(`'sha256-${expected}'`);
  });

  it("hashes the exact head script the layout renders", () => {
    expect(headInlineScript(false)).toBe(THEME_SCRIPT);
    expect(headInlineScript(true).startsWith(THEME_SCRIPT)).toBe(true);
    expect(scriptHash(headInlineScript(false))).not.toBe(scriptHash(headInlineScript(true)));
  });

  it("matches nonce pages by whole path segment", () => {
    expect(usesNonceCsp("/login")).toBe(true);
    expect(usesNonceCsp("/login/verify")).toBe(true);
    expect(usesNonceCsp("/login/reset")).toBe(true);
    expect(usesNonceCsp("/oauth/consent")).toBe(true);
    expect(usesNonceCsp("/loginx")).toBe(false);
    expect(usesNonceCsp("/today")).toBe(false);
    expect(usesNonceCsp("/oauth")).toBe(false);
  });

  it("declares the reporting endpoint", () => {
    expect(reportingEndpoints()).toBe('csp="/api/csp-report"');
  });
});

describe("security headers", () => {
  it("sends HSTS only in production", () => {
    const keys = (production: boolean) => baseSecurityHeaders({ production }).map((h) => h.key);
    expect(keys(true)).toContain("Strict-Transport-Security");
    expect(keys(false)).not.toContain("Strict-Transport-Security");
    expect(baseSecurityHeaders({ production: true }).find((h) => h.key === "Strict-Transport-Security")?.value).toBe("max-age=63072000; includeSubDomains");
  });

  it("locks down framing, sniffing, referrers, powerful features and indexing", () => {
    const h = Object.fromEntries(baseSecurityHeaders({ production: true }).map((x) => [x.key, x.value]));
    expect(h).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Cross-Origin-Opener-Policy": "same-origin",
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex, nofollow",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), publickey-credentials-get=(self), publickey-credentials-create=(self)",
    });
  });

  it("ships the static CSP report-only first", () => {
    const [csp, reporting] = staticCspHeaders({ supabaseUrl: SUPABASE });
    expect(CSP_HEADER).toBe("Content-Security-Policy-Report-Only");
    expect(csp).toEqual({ key: CSP_HEADER, value: serializeCsp(staticCsp({ supabaseUrl: SUPABASE })) });
    expect(reporting).toEqual({ key: "Reporting-Endpoints", value: 'csp="/api/csp-report"' });
  });
});
