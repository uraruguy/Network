/**
 * Parsing for CSP violation reports (POSTed to /api/csp-report). Everything here treats the body
 * as hostile: only whitelisted fields survive, URLs lose their query/fragment (signed links carry
 * secrets there), and every string is truncated.
 */

export type Violation = {
  documentURL?: string;
  blockedURL?: string;
  effectiveDirective?: string;
  disposition?: string;
  sourceFile?: string;
  lineNumber?: number;
  sample?: string;
};

/** Strips query strings and fragments (signed links!) and bounds the length. */
function scrubUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return value.slice(0, 40); // "inline", "eval", "data" …
  try {
    const u = new URL(value);
    return (u.protocol === "data:" || u.protocol === "blob:" ? u.protocol : u.origin + u.pathname).slice(0, 300);
  } catch {
    return undefined;
  }
}

const str = (v: unknown, max = 80) => (typeof v === "string" && v ? v.slice(0, max) : undefined);

/** Normalises both report formats: legacy `application/csp-report` and Reporting API batches. */
export function parseReports(body: unknown): Violation[] {
  const raw: Record<string, unknown>[] = [];
  if (Array.isArray(body)) {
    for (const r of body.slice(0, 20)) {
      if (r && typeof r === "object" && (r as { type?: unknown }).type === "csp-violation") {
        const b = (r as { body?: unknown }).body;
        if (b && typeof b === "object") raw.push(b as Record<string, unknown>);
      }
    }
  } else if (body && typeof body === "object" && "csp-report" in body) {
    const r = (body as Record<string, unknown>)["csp-report"];
    if (r && typeof r === "object") {
      const c = r as Record<string, unknown>;
      raw.push({
        documentURL: c["document-uri"],
        blockedURL: c["blocked-uri"],
        effectiveDirective: c["effective-directive"] ?? c["violated-directive"],
        disposition: c.disposition,
        sourceFile: c["source-file"],
        lineNumber: c["line-number"],
        sample: c["script-sample"],
      });
    }
  }
  return raw.map((r) => ({
    documentURL: scrubUrl(r.documentURL),
    blockedURL: scrubUrl(r.blockedURL),
    effectiveDirective: str(r.effectiveDirective, 40),
    disposition: str(r.disposition, 12),
    sourceFile: scrubUrl(r.sourceFile),
    lineNumber: typeof r.lineNumber === "number" ? r.lineNumber : undefined,
    sample: str(r.sample, 40),
  }));
}
