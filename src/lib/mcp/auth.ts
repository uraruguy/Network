import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { after } from "next/server";
import { parseClaims, type SessionClaims } from "@/lib/auth/claims";
import { findTokenRecord, touchToken } from "@/lib/data/api-tokens";
import { findGrantRecord, touchGrant } from "@/lib/data/oauth-grants";
import { clientEnv } from "@/lib/env";
import { safeTimeZone } from "@/lib/time/zoned";
import { ToolError, type Scope, type ToolCtx } from "@/lib/ai/tools/registry";
import { approvalEvidence } from "./approval-log";
import { isApprovedSession, oauthSessionStart } from "./approvals";
import { looksLikePat, normalizeScopes, PAT_PATTERN } from "./tokens";

/**
 * Bearer authentication for /api/mcp (passed to mcp-handler's `withMcpAuth`). Two credentials:
 *
 *  1. Personal access token (`ntk_…`): HMAC lookup in `api_tokens`; revoked or expired → rejected;
 *     scopes come from the row.
 *  2. OAuth access token issued by Supabase Auth to an MCP client: JWT verified locally
 *     (`getClaims`), must carry a `client_id`, and the owner (`sub`) must have an un-revoked
 *     `oauth_client_grants` row for that client; scopes come from the grant (the access the owner
 *     chose on the consent page), not from the token. The token's session must also have been
 *     created right after a passkey-verified approval (approvals.ts): Supabase itself would mint
 *     tokens for an approved client from a password-only session.
 *
 * Unknown/invalid tokens return `undefined`, which `withMcpAuth({ required: true })` turns into a
 * 401 with an RFC 9728 `WWW-Authenticate` challenge.
 */

/** What the MCP tools need about the caller, carried in `AuthInfo.extra`. */
export type McpCaller = {
  ownerId: string;
  kind: "pat" | "oauth";
  /** "pat:<token id>" or "oauth:<client id>" — audit actor and rate-limit key. */
  credential: string;
  /** Token name or OAuth client name, stored as `source_ref` on what the client creates. */
  client: string;
  timezone: string;
};

/** How long an OAuth grant lookup is cached in memory (revocations elsewhere apply within this). */
export const GRANT_CACHE_MS = 30_000;
const TOUCH_INTERVAL_MS = 5 * 60_000;

const grantCache = new Map<string, { at: number; grant: Awaited<ReturnType<typeof findGrantRecord>> }>();
/** Approval verdicts per OAuth session (`owner:client:session`). */
const sessionCache = new Map<string, { at: number; approved: boolean }>();
const lastTouch = new Map<string, number>();

/** Forget a cached grant and its session verdicts (call after approving or revoking it in this process). */
export function forgetGrant(ownerId: string, clientId: string) {
  const key = `${ownerId}:${clientId}`;
  grantCache.delete(key);
  for (const k of sessionCache.keys()) if (k.startsWith(`${key}:`)) sessionCache.delete(k);
}

/** Runs bookkeeping after the response; falls back to fire-and-forget outside a request (tests, scripts). */
function later(task: () => Promise<unknown>) {
  const run = () => task().catch((err) => console.error("[mcp] background task failed", err));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** At most one `last_used_at` write per credential per interval (per server instance). */
function touchThrottled(key: string, lastUsedAt: Date | null, write: () => Promise<void>) {
  const now = Date.now();
  const seen = Math.max(lastTouch.get(key) ?? 0, lastUsedAt?.getTime() ?? 0);
  if (now - seen < TOUCH_INTERVAL_MS) return;
  lastTouch.set(key, now);
  later(write);
}

function authInfo(token: string, clientId: string, scopes: Scope[], caller: McpCaller): AuthInfo {
  return { token, clientId, scopes, extra: { caller } };
}

async function verifyPat(token: string): Promise<AuthInfo | undefined> {
  if (!PAT_PATTERN.test(token)) return undefined;
  const row = await findTokenRecord(token);
  if (!row || row.revokedAt) return undefined;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return undefined;
  const scopes = normalizeScopes(row.scopes);
  if (!scopes.length) return undefined;
  touchThrottled(`pat:${row.id}`, row.lastUsedAt, () => touchToken(row.id));
  return authInfo(token, `pat:${row.id}`, scopes, {
    ownerId: row.ownerId,
    kind: "pat",
    credential: `pat:${row.id}`,
    client: row.name,
    timezone: safeTimeZone(row.timezone),
  });
}

let verifier: ReturnType<typeof createClient> | null = null;
/** A cookie-less Supabase client, only used to verify JWTs (JWKS cached by supabase-js). */
function jwtVerifier() {
  verifier ??= createClient(clientEnv.NEXT_PUBLIC_SUPABASE_URL, clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return verifier;
}

type OAuthClaims = SessionClaims & { clientId: string; sessionStart: Date | null };

/** Verified OAuth-client claims plus the session's creation time (from `amr`), or null. */
async function verifyOAuthJwt(token: string): Promise<OAuthClaims | null> {
  try {
    const { data, error } = await jwtVerifier().auth.getClaims(token);
    if (error || !data) return null;
    const claims = parseClaims(data.claims, { allowOAuthClient: true });
    // Only tokens issued to an OAuth client: a browser session JWT must never work here.
    if (!claims?.clientId) return null;
    return { ...claims, clientId: claims.clientId, sessionStart: oauthSessionStart((data.claims as { amr?: unknown }).amr) };
  } catch {
    return null;
  }
}

async function cachedGrant(ownerId: string, clientId: string) {
  const key = `${ownerId}:${clientId}`;
  const hit = grantCache.get(key);
  if (hit && Date.now() - hit.at < GRANT_CACHE_MS) return hit.grant;
  const grant = await findGrantRecord(ownerId, clientId);
  grantCache.set(key, { at: Date.now(), grant });
  return grant;
}

/** Was this OAuth session minted right after a passkey-verified approval? Fails closed without `amr`. */
async function cachedApproval({ sub, clientId, sessionId, sessionStart }: OAuthClaims) {
  if (!sessionStart) return false;
  const key = `${sub}:${clientId}:${sessionId}`;
  const hit = sessionCache.get(key);
  if (hit && Date.now() - hit.at < GRANT_CACHE_MS) return hit.approved;
  const approved = isApprovedSession(await approvalEvidence(sub, clientId, sessionStart));
  if (!approved) console.warn("[mcp] refused an OAuth session without a passkey-verified approval", { clientId, sessionStart: sessionStart.toISOString() });
  sessionCache.set(key, { at: Date.now(), approved });
  return approved;
}

async function verifyOAuth(token: string): Promise<AuthInfo | undefined> {
  const claims = await verifyOAuthJwt(token);
  if (!claims) return undefined;
  const grant = await cachedGrant(claims.sub, claims.clientId);
  if (!grant || grant.revokedAt) return undefined;
  const scopes = normalizeScopes(grant.scopes);
  if (!scopes.length) return undefined;
  if (!(await cachedApproval(claims))) return undefined;
  touchThrottled(`oauth:${claims.sub}:${claims.clientId}`, null, () => touchGrant(claims.sub, claims.clientId));
  return authInfo(token, claims.clientId, scopes, {
    ownerId: claims.sub,
    kind: "oauth",
    credential: `oauth:${claims.clientId}`,
    client: grant.clientName ?? "OAuth app",
    timezone: safeTimeZone(grant.timezone),
  });
}

/** `withMcpAuth` verifier. */
export async function verifyToken(_req: Request, bearer?: string): Promise<AuthInfo | undefined> {
  if (!bearer) return undefined;
  return looksLikePat(bearer) ? verifyPat(bearer) : verifyOAuth(bearer);
}

/** The tool context for an authenticated MCP request. */
export function toolCtxFromAuth(info: AuthInfo | undefined): ToolCtx {
  const caller = (info?.extra as { caller?: McpCaller } | undefined)?.caller;
  if (!info || !caller) throw new ToolError("forbidden", "Not authenticated.");
  return {
    ownerId: caller.ownerId,
    scopes: normalizeScopes(info.scopes),
    actor: { via: "mcp", client: caller.client, credential: caller.credential },
    timezone: caller.timezone,
  };
}
