/**
 * Binds OAuth sessions to passkey-verified approvals. Pure; tested.
 *
 * Supabase hands an authorization code to whoever holds a session — no passkey involved, and for
 * a consented client it does so without asking (`getAuthorizationDetails` returns the code). So
 * a leaked password alone could mint MCP access tokens for any client the owner approved. What an
 * attacker can't fake is *when* the session behind a token was created: Supabase stamps it in the
 * `amr` claim (`oauth_provider/authorization_code`, the code-exchange time, kept across refreshes),
 * and the passkey-gated consent page records every approval in the audit log. /api/mcp honours a
 * session only if an approval for its client (or an explicit "reconnect") happened in the
 * minutes before it was created, and the client hasn't been disconnected since.
 */

/** Audit actions the consent page and the disconnect endpoint record. */
export const APPROVAL_ACTIONS = {
  /** Consent form approved (entity_id = client id; meta has the redirect URI and scopes). */
  approve: "grant.approve",
  /** A consented client came back and the owner pressed Continue (client unknown to us: entity_id null). */
  reauthorize: "grant.reauthorize",
  /** Disconnected in Settings → Connected apps (entity_id = client id). */
  revoke: "grant.revoke",
} as const;

/** How long after an approval its code may be exchanged (Supabase expires authorizations after minutes). */
export const APPROVAL_WINDOW_MS = 10 * 60_000;
/** Approval and session times both come from the database clock; this only absorbs rounding. */
export const APPROVAL_SKEW_MS = 60_000;

const CODE_EXCHANGE = "oauth_provider/authorization_code";

/** When the OAuth session behind an access token was created, from its `amr` claim; null if absent. */
export function oauthSessionStart(amr: unknown): Date | null {
  if (!Array.isArray(amr)) return null;
  let at: number | null = null;
  for (const e of amr) {
    if (!e || typeof e !== "object" || (e as { method?: unknown }).method !== CODE_EXCHANGE) continue;
    const ts = (e as { timestamp?: unknown }).timestamp;
    if (typeof ts === "number" && Number.isFinite(ts) && (at === null || ts > at)) at = ts;
  }
  return at === null ? null : new Date(at * 1000);
}

/** Approvals that can account for a session created at `start`. */
export function approvalWindow(start: Date): { from: Date; to: Date } {
  return { from: new Date(start.getTime() - APPROVAL_WINDOW_MS), to: new Date(start.getTime() + APPROVAL_SKEW_MS) };
}

/**
 * The latest approval inside the window, and the latest disconnect of the client since the window
 * opened — both from the audit log.
 */
export type ApprovalEvidence = { approvedAt: Date | null; revokedAt: Date | null };

/** Approved, and not disconnected afterwards (a disconnect ends every session minted before it). */
export function isApprovedSession({ approvedAt, revokedAt }: ApprovalEvidence): boolean {
  return approvedAt !== null && (revokedAt === null || revokedAt.getTime() < approvedAt.getTime());
}
