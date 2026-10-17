import { authServerIssuer } from "@/lib/mcp/config";
import { metadataOptions } from "@/lib/mcp/metadata";

/**
 * Mirror of Supabase Auth's OAuth authorization-server metadata (RFC 8414), for older MCP clients
 * that look for it on the resource's own origin instead of following the protected-resource
 * metadata. The document itself (issuer, endpoints) is Supabase's, unchanged.
 */

export async function GET() {
  const issuer = authServerIssuer();
  const origin = new URL(issuer).origin;
  // RFC 8414 path-suffixed location first, then the issuer-relative one.
  for (const url of [`${origin}/.well-known/oauth-authorization-server/auth/v1`, `${issuer}/.well-known/oauth-authorization-server`]) {
    try {
      // Not cached by Next: a disabled/misconfigured OAuth server must not stick for an hour.
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const body = (await res.json()) as Record<string, unknown>;
      if (typeof body.issuer !== "string") continue;
      return Response.json(body, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } });
    } catch {
      // try the next location
    }
  }
  return Response.json({ error: "unavailable", message: "The authorization server metadata is unavailable (is the Supabase OAuth server enabled?)" }, { status: 502 });
}

export const OPTIONS = metadataOptions;
