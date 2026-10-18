import { generateProtectedResourceMetadata, metadataCorsOptionsRequestHandler } from "mcp-handler";
import { authServerIssuer, mcpResourceUrl, appOrigin } from "./config";

/**
 * OAuth Protected Resource Metadata (RFC 9728) for /api/mcp. Built with mcp-handler's
 * `generateProtectedResourceMetadata` (rather than `protectedResourceHandler`) so it can add a
 * name and docs link. Served at both `/.well-known/oauth-protected-resource` and the path-suffixed
 * `/.well-known/oauth-protected-resource/api/mcp`.
 *
 * Deliberately no `scopes_supported`: MCP clients copy it into the authorization request, and
 * Supabase's OAuth server refuses any scope it doesn't know ("unsupported scope: network:read"),
 * which broke the flow before the consent page. The access level is chosen on the consent page and
 * stored on the grant (auth.ts), so the token's own scopes don't matter.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export function protectedResourceResponse(): Response {
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [authServerIssuer()],
    resourceUrl: mcpResourceUrl(),
    additionalMetadata: {
      bearer_methods_supported: ["header"],
      resource_name: "The Network",
      resource_documentation: `${appOrigin()}/settings#connected-apps`,
    },
  });
  return Response.json(metadata, { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } });
}

export const metadataOptions = metadataCorsOptionsRequestHandler();
