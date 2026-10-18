import { clientEnv } from "@/lib/env";

/**
 * Public URLs of the MCP surface. The app's own origin comes from NEXT_PUBLIC_APP_URL (set it to
 * the deployed https URL); Supabase Auth is the OAuth authorization server.
 */

const trimSlash = (s: string) => s.replace(/\/+$/, "");

export const appOrigin = () => trimSlash(clientEnv.NEXT_PUBLIC_APP_URL);

/** The protected resource (RFC 9728 `resource`) and the URL clients connect to. */
export const mcpResourceUrl = () => `${appOrigin()}/api/mcp`;

/** Path of the protected-resource metadata for /api/mcp (RFC 9728 path-suffixed form). */
export const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource/api/mcp";

/** Supabase Auth's issuer — the authorization server MCP clients discover. */
export const authServerIssuer = () => `${trimSlash(clientEnv.NEXT_PUBLIC_SUPABASE_URL)}/auth/v1`;
