import type { SupabaseClient } from "@supabase/supabase-js";

/** The only part of a Supabase client these helpers need (any server or browser client fits). */
type ClaimsClient = { auth: Pick<SupabaseClient["auth"], "getClaims"> };

/** What the app trusts about the caller, taken from a verified Supabase access token. */
export type SessionClaims = {
  /** auth.users.id — the owner id for every query. */
  sub: string;
  /** Supabase session id; the passkey (MFA) cookie is bound to it. */
  sessionId: string;
  aal: "aal1" | "aal2";
  email: string | null;
  /** Set only on OAuth access tokens issued to a third-party client (e.g. an MCP connector). */
  clientId: string | null;
};

/**
 * Validates the shape of verified JWT claims. Pure, so it can be unit-tested.
 * Rejects anonymous users, non-`authenticated` roles, tokens without a session, and — unless
 * explicitly allowed — OAuth tokens issued to third-party clients, which must never act as a
 * browser session.
 */
export function parseClaims(raw: unknown, opts: { allowOAuthClient?: boolean } = {}): SessionClaims | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.sub !== "string" || !c.sub) return null;
  if (typeof c.session_id !== "string" || !c.session_id) return null;
  if (c.role !== "authenticated" || c.is_anonymous === true) return null;
  const clientId = typeof c.client_id === "string" && c.client_id ? c.client_id : null;
  if (clientId && !opts.allowOAuthClient) return null;
  return {
    sub: c.sub,
    sessionId: c.session_id,
    aal: c.aal === "aal2" ? "aal2" : "aal1",
    email: typeof c.email === "string" ? c.email : null,
    clientId,
  };
}

/**
 * Verifies the browser session carried in the Supabase auth cookies.
 *
 * `getClaims()` refreshes an expired access token (writing new cookies through the client's cookie
 * adapter) and verifies the JWT signature locally against the project's cached JWKS — no Auth
 * server round trip on the hot path. Returns null for anything that isn't a valid web session.
 */
export async function verifySession(supabase: ClaimsClient): Promise<SessionClaims | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data) return null;
    return parseClaims(data.claims);
  } catch {
    // Auth unreachable (offline, misconfigured): treat as signed out.
    return null;
  }
}

/**
 * Verifies a bearer access token (e.g. from an MCP client). OAuth client tokens are accepted here
 * and reported through `clientId`; callers must check the client's grant and scopes.
 */
export async function verifyBearer(supabase: ClaimsClient, token: string): Promise<SessionClaims | null> {
  try {
    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data) return null;
    return parseClaims(data.claims, { allowOAuthClient: true });
  } catch {
    return null;
  }
}
