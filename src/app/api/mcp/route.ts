import { withMcpAuth } from "mcp-handler";
import { verifyToken } from "@/lib/mcp/auth";
import { appOrigin, RESOURCE_METADATA_PATH } from "@/lib/mcp/config";
import { mcpHandler } from "@/lib/mcp/server";

/**
 * /api/mcp — the MCP endpoint (stateless Streamable HTTP). Every request needs a bearer token:
 * a personal access token (`ntk_…`, Settings → Connected apps) or an OAuth access token from
 * Supabase Auth. Unauthenticated requests get a 401 whose `WWW-Authenticate` header points to
 * the protected-resource metadata, which is how MCP clients discover the OAuth flow.
 *
 * The auth proxy skips this route (machine route); authentication happens here.
 */

export const maxDuration = 60;

const handler = withMcpAuth(mcpHandler, verifyToken, {
  required: true,
  resourceMetadataPath: RESOURCE_METADATA_PATH,
  resourceUrl: appOrigin(),
});

export { handler as GET, handler as POST, handler as DELETE };
