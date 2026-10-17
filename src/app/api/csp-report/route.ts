import { parseReports } from "@/lib/security/csp-report";
import { clientKey, createRateLimiter } from "@/lib/security/rate-limit";

/**
 * CSP violation sink (`report-uri` / `report-to` in src/lib/security/csp.ts). A machine route:
 * browsers send reports without credentials, so anyone can POST here. Hence:
 *   - bodies are size-capped and parsed defensively,
 *   - only a few whitelisted, truncated fields are logged (never the full sample / URL query),
 *   - per-client rate limiting, and always a bodiless 204 so the endpoint reveals nothing.
 *
 * Reports land in the server logs (Vercel → Logs, search "csp-violation").
 */

const MAX_BODY_BYTES = 16 * 1024;
const perClient = createRateLimiter({ limit: 30, windowMs: 60_000 });
/** Caps total log volume per instance, whatever the (spoofable) client key says. */
const overall = createRateLimiter({ limit: 300, windowMs: 60_000, maxKeys: 1 });
const NO_CONTENT = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  if (!perClient.hit(clientKey(req.headers)) || !overall.hit("all")) return NO_CONTENT();
  const type = req.headers.get("content-type") ?? "";
  if (!/^application\/(csp-report|reports\+json|json)\b/i.test(type)) return NO_CONTENT();
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return NO_CONTENT();

  let text: string;
  try {
    text = await readCapped(req, MAX_BODY_BYTES);
  } catch {
    return NO_CONTENT();
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NO_CONTENT();
  }
  for (const v of parseReports(body)) console.warn("csp-violation", JSON.stringify(v));
  return NO_CONTENT();
}

/** Reads at most `max` bytes of the body; throws beyond that (no unbounded buffering). */
async function readCapped(req: Request, max: number): Promise<string> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new Error("Report too large");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
