import "server-only";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { deriveKey, verificationKeys } from "@/lib/crypto/keys";
import { generateToken, hashToken, normalizeScopes, tokenPrefix } from "@/lib/mcp/tokens";
import type { Scope } from "@/lib/ai/tools/registry";

/**
 * Personal access tokens. Only an HMAC of the secret is stored (key: `deriveKey("pat-pepper")`);
 * the plaintext exists once, in the response that creates it.
 */

const { apiTokens, profiles } = schema;
const PEPPER = "pat-pepper";
/** Active tokens one owner may hold. */
export const MAX_ACTIVE_TOKENS = 25;

export type ApiTokenSummary = {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: Scope[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
};

const summaryColumns = {
  id: apiTokens.id,
  name: apiTokens.name,
  tokenPrefix: apiTokens.tokenPrefix,
  scopes: apiTokens.scopes,
  lastUsedAt: apiTokens.lastUsedAt,
  expiresAt: apiTokens.expiresAt,
  createdAt: apiTokens.createdAt,
};

const toSummary = (r: Omit<ApiTokenSummary, "scopes"> & { scopes: string[] }): ApiTokenSummary => ({ ...r, scopes: normalizeScopes(r.scopes) });

/** Active (not revoked) tokens, newest first. */
export async function listTokens(ownerId: string): Promise<ApiTokenSummary[]> {
  const rows = await db.select(summaryColumns).from(apiTokens).where(and(eq(apiTokens.ownerId, ownerId), isNull(apiTokens.revokedAt))).orderBy(desc(apiTokens.createdAt));
  return rows.map(toSummary);
}

export class TooManyTokensError extends Error {}

/** Creates a token and returns its plaintext — the only time it is ever available. */
export async function createToken(ownerId: string, input: { name: string; scopes: Scope[]; expiresAt?: Date | null }): Promise<{ token: string; item: ApiTokenSummary }> {
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(apiTokens)
    .where(and(eq(apiTokens.ownerId, ownerId), isNull(apiTokens.revokedAt)));
  if (n >= MAX_ACTIVE_TOKENS) throw new TooManyTokensError(`At most ${MAX_ACTIVE_TOKENS} active tokens; revoke one first.`);
  const token = generateToken();
  const [row] = await db
    .insert(apiTokens)
    .values({
      ownerId,
      name: input.name,
      tokenPrefix: tokenPrefix(token),
      tokenHash: hashToken(token, deriveKey(PEPPER)),
      scopes: normalizeScopes(input.scopes),
      expiresAt: input.expiresAt ?? null,
    })
    .returning(summaryColumns);
  return { token, item: toSummary(row!) };
}

/** Revokes one of the owner's tokens. False when there was nothing to revoke. */
export async function revokeToken(ownerId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.ownerId, ownerId), eq(apiTokens.id, id), isNull(apiTokens.revokedAt)))
    .returning({ id: apiTokens.id });
  return rows.length > 0;
}

export type TokenRecord = {
  id: string;
  ownerId: string;
  name: string;
  scopes: string[];
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  timezone: string | null;
};

/**
 * Looks a presented token up by its HMAC (current pepper, and the previous one during an
 * APP_SECRET rotation), with the owner's time zone. Revoked/expired rows are returned too — the
 * caller decides — so the check is explicit and testable.
 */
export async function findTokenRecord(token: string): Promise<TokenRecord | null> {
  const hashes = verificationKeys(PEPPER).map((key) => hashToken(token, key));
  const [row] = await db
    .select({
      id: apiTokens.id,
      ownerId: apiTokens.ownerId,
      name: apiTokens.name,
      scopes: apiTokens.scopes,
      expiresAt: apiTokens.expiresAt,
      revokedAt: apiTokens.revokedAt,
      lastUsedAt: apiTokens.lastUsedAt,
      timezone: profiles.timezone,
    })
    .from(apiTokens)
    .leftJoin(profiles, eq(profiles.id, apiTokens.ownerId))
    .where(inArray(apiTokens.tokenHash, hashes))
    .limit(1);
  return row ?? null;
}

/** Records use, at most once per `minIntervalMs` (the condition lives in SQL, so racing calls are cheap). */
export async function touchToken(id: string, minIntervalMs = 5 * 60_000): Promise<void> {
  const before = new Date(Date.now() - minIntervalMs);
  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(apiTokens.id, id), or(isNull(apiTokens.lastUsedAt), lt(apiTokens.lastUsedAt, before))));
}
