import { withOwner } from "@/lib/api-server";
import { runDigest } from "@/lib/data/digest";

/**
 * Owner-only preview of today's digest e-mail, rendered as HTML (replaces the old
 * `/api/cron/reminders?preview=1&secret=…`). Session + passkey required like every app API.
 *
 * The e-mail is static markup with inline styles, so the response gets its own enforced,
 * locked-down policy: sandboxed (no scripts, no same-origin access), no network except images,
 * frameable only by the app itself (e.g. an <iframe> in Settings).
 */
const PREVIEW_CSP = "sandbox; default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; frame-ancestors 'self'";

export const GET = withOwner(async ({ owner }) => {
  const results = await runDigest({ preview: true });
  // runDigest renders every profile; only ever show the caller's own.
  const mine = owner.claims.email ? results.find((r) => r.email.toLowerCase() === owner.claims.email!.toLowerCase()) : undefined;
  const html = mine?.html ?? "<!doctype html><p style=\"font:15px -apple-system,sans-serif;color:#3f5a5c\">Nothing to preview yet.</p>"; // design-ignore
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": PREVIEW_CSP,
      "x-frame-options": "SAMEORIGIN",
      "cache-control": "private, no-store",
    },
  });
});
