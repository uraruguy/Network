import "server-only";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { normalizeScopes } from "@/lib/mcp/tokens";
import type { Scope } from "@/lib/ai/tools/registry";

/**
 * OAuth clients (MCP connectors such as claude.ai) the owner approved on the consent page, with
 * the access they chose. Supabase issues the tokens; this table decides what a client may do,
 * and revoking a row cuts the client off at once (even before its access token expires).
 */

const { oauthClientGrants, profiles } = schema;

export type GrantSummary = { clientId: string; clientName: string | null; scopes: Scope[]; grantedAt: Date; lastUsedAt: Date | null };

const columns = {
  clientId: oauthClientGrants.clientId,
  clientName: oauthClientGrants.clientName,
  scopes: oauthClientGrants.scopes,
  grantedAt: oauthClientGrants.grantedAt,
  lastUsedAt: oauthClientGrants.lastUsedAt,
};

export async function listGrants(ownerId: string): Promise<GrantSummary[]> {
  const rows = await db
    .select(columns)
    .from(oauthClientGrants)
    .where(and(eq(oauthClientGrants.ownerId, ownerId), isNull(oauthClientGrants.revokedAt)))
    .orderBy(desc(oauthClientGrants.grantedAt));
  return rows.map((r) => ({ ...r, scopes: normalizeScopes(r.scopes) }));
}

/** Records (or renews) consent for a client. Re-approving a revoked client reactivates it. */
export async function upsertGrant(ownerId: string, input: { clientId: string; clientName: string | null; scopes: Scope[] }): Promise<void> {
  const scopes = normalizeScopes(input.scopes);
  const now = new Date();
  await db
    .insert(oauthClientGrants)
    .values({ ownerId, clientId: input.clientId, clientName: input.clientName, scopes, grantedAt: now })
    .onConflictDoUpdate({
      target: [oauthClientGrants.ownerId, oauthClientGrants.clientId],
      set: { clientName: input.clientName, scopes, grantedAt: now, revokedAt: null },
    });
}

export async function revokeGrant(ownerId: string, clientId: string): Promise<boolean> {
  const rows = await db
    .update(oauthClientGrants)
    .set({ revokedAt: new Date() })
    .where(and(eq(oauthClientGrants.ownerId, ownerId), eq(oauthClientGrants.clientId, clientId), isNull(oauthClientGrants.revokedAt)))
    .returning({ clientId: oauthClientGrants.clientId });
  return rows.length > 0;
}

export type GrantRecord = { clientId: string; clientName: string | null; scopes: string[]; revokedAt: Date | null; timezone: string | null };

/** The grant for (owner, client) with the owner's time zone, revoked or not; null if never granted. */
export async function findGrantRecord(ownerId: string, clientId: string): Promise<GrantRecord | null> {
  const [row] = await db
    .select({
      clientId: oauthClientGrants.clientId,
      clientName: oauthClientGrants.clientName,
      scopes: oauthClientGrants.scopes,
      revokedAt: oauthClientGrants.revokedAt,
      timezone: profiles.timezone,
    })
    .from(oauthClientGrants)
    .leftJoin(profiles, eq(profiles.id, oauthClientGrants.ownerId))
    .where(and(eq(oauthClientGrants.ownerId, ownerId), eq(oauthClientGrants.clientId, clientId)))
    .limit(1);
  return row ?? null;
}

export async function touchGrant(ownerId: string, clientId: string, minIntervalMs = 5 * 60_000): Promise<void> {
  const before = new Date(Date.now() - minIntervalMs);
  await db
    .update(oauthClientGrants)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(oauthClientGrants.ownerId, ownerId),
        eq(oauthClientGrants.clientId, clientId),
        or(isNull(oauthClientGrants.lastUsedAt), lt(oauthClientGrants.lastUsedAt, before)),
      ),
    );
}
