import { generateProtectedResourceMetadata, metadataCorsOptionsRequestHandler } from "mcp-handler";
import { authServerIssuer, MCP_SCOPES, mcpResourceUrl, appOrigin } from "./config";

/**
 * OAuth Protected Resource Metadata (RFC 9728) for /api/mcp. Built with mcp-handler's
 * `generateProtectedResourceMetadata` (rather than `protectedResourceHandler`) so it can also
 * advertise `scopes_supported`. Served at both `/.well-known/oauth-protected-resource` and the
 * path-suffixed `/.well-known/oauth-protected-resource/api/mcp`.
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
      scopes_supported: [...MCP_SCOPES],
      bearer_methods_supported: ["header"],
      resource_name: "The Network",
      resource_documentation: `${appOrigin()}/settings#connected-apps`,
    },
  });
  return Response.json(metadata, { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } });
}

export const metadataOptions = metadataCorsOptionsRequestHandler();
