import "server-only";
import { createHash, createHmac } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { hkdfKey } from "@/lib/crypto/keys";
import { decryptSecret, encryptSecret, SecretDecryptError, secretHint, type SecretContext } from "@/lib/crypto/secrets";

/**
 * Per-owner connections to outside services (AI provider, e-mail sender), stored in the
 * `connections` table with the secret encrypted (see src/lib/crypto/secrets.ts).
 *
 * Resolution everywhere is: environment variables first (read-only in the UI, "Managed by
 * environment"), then the database row, else nothing. Results are cached per server instance for
 * 60 s and the cache is cleared on every save.
 *
 * `config.check` remembers the last connection test — which source it tested, a fingerprint of
 * the tested settings, latency and model — so a test result only counts while the settings it
 * tested are still the active ones.
 *
 * APP_SECRET rotation: a secret that only APP_SECRET_PREVIOUS can open is re-encrypted with the
 * current key the next time it is loaded or saved (`openStoredSecret`).
 */

const { connections } = schema;

export type ConnectionKind = "ai" | "email";
export type ConnectionSource = "env" | "db";

export type ConnectionCheck = {
  at: string;
  ok: boolean;
  source: ConnectionSource;
  /** Keyed hash of the settings that were tested (never the secret itself). */
  fingerprint: string;
  latencyMs?: number;
  model?: string;
  error?: string;
};

export type StoredConnection = {
  ownerId: string;
  kind: ConnectionKind;
  provider: string;
  /** User settings (models, from address, SMTP host …) without the bookkeeping `check`. */
  config: Record<string, unknown>;
  secret: string | null;
  secretHint: string | null;
  /** Set when a stored secret could not be decrypted (APP_SECRET changed). */
  secretError: string | null;
  verifiedAt: Date | null;
  lastError: string | null;
  check: ConnectionCheck | null;
  updatedAt: Date;
};

/* ---------- cache ---------- */

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

/** Memoises `load` under `key` for 60 s (per server instance). Failures are not cached. */
export function cached<T>(key: string, load: () => Promise<T>, ttlMs = TTL_MS): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
}

export function clearConnectionCache() {
  cache.clear();
}

/* ---------- fingerprints ---------- */

/**
 * Keyed fingerprint of the effective settings (provider, secret, models, host …). HMAC so a leaked
 * database row doesn't allow guessing short SMTP passwords offline.
 */
export function fingerprint(parts: (string | number | boolean | null | undefined)[], env: Record<string, string | undefined> = process.env): string {
  const data = parts.map((p) => (p === undefined || p === null ? "" : String(p))).join("\u0000");
  const secret = env.APP_SECRET && env.APP_SECRET.length >= 32 ? env.APP_SECRET : null;
  return secret
    ? createHmac("sha256", hkdfKey(secret, "connections-fingerprint")).update(data).digest("hex").slice(0, 24)
    : createHash("sha256").update(`network:fingerprint:${data}`).digest("hex").slice(0, 24);
}

/* ---------- secrets & APP_SECRET rotation ---------- */

type Row = typeof connections.$inferSelect;

export type OpenedSecret = {
  secret: string | null;
  error: string | null;
  /** The secret re-encrypted with the current APP_SECRET when only APP_SECRET_PREVIOUS opened it. */
  reencrypted: string | null;
};

/**
 * Decrypts a stored secret and notices when it was written under APP_SECRET_PREVIOUS, returning a
 * replacement token under the current key — so stored keys survive a rotation once
 * APP_SECRET_PREVIOUS is dropped. Pure (env is a parameter).
 */
export function openStoredSecret(token: string, ctx: SecretContext, env: Record<string, string | undefined> = process.env): OpenedSecret {
  try {
    return { secret: decryptSecret(token, ctx, { ...env, APP_SECRET_PREVIOUS: undefined }), error: null, reencrypted: null };
  } catch {
    // Not under the current key: try the previous one.
  }
  try {
    const secret = decryptSecret(token, ctx, env);
    return { secret, error: null, reencrypted: encryptSecret(secret, ctx, env) };
  } catch (err) {
    return { secret: null, error: err instanceof SecretDecryptError ? err.message : "Could not decrypt the stored secret", reencrypted: null };
  }
}

/** Stores a re-encrypted secret unless the row changed meanwhile (compare-and-swap on the old token). */
async function storeReencrypted(row: Row, token: string) {
  try {
    await db
      .update(connections)
      .set({ secretEnc: token })
      .where(and(eq(connections.ownerId, row.ownerId), eq(connections.kind, row.kind), eq(connections.secretEnc, row.secretEnc!)));
    clearConnectionCache();
  } catch (err) {
    console.error("[connections] could not re-encrypt a stored secret", err);
  }
}

/* ---------- reads ---------- */

function splitConfig(config: unknown): { config: Record<string, unknown>; check: ConnectionCheck | null } {
  const obj = config && typeof config === "object" && !Array.isArray(config) ? { ...(config as Record<string, unknown>) } : {};
  const check = (obj.check as ConnectionCheck | undefined) ?? null;
  delete obj.check;
  return { config: obj, check };
}

function toStored(row: Row, opened: OpenedSecret | null): StoredConnection {
  const { config, check } = splitConfig(row.config);
  const secret = opened?.secret ?? null;
  const secretError = opened?.error ?? null;
  return {
    ownerId: row.ownerId,
    kind: row.kind,
    provider: row.provider,
    config,
    secret,
    secretHint: row.secretHint,
    secretError,
    verifiedAt: row.verifiedAt,
    lastError: row.lastError,
    check,
    updatedAt: row.updatedAt,
  };
}

/**
 * The stored connection of `kind` for `ownerId` — or, without an owner (cron, background jobs in
 * this single-user app), the most recently updated one. Not cached; see `cached()`. A secret still
 * under APP_SECRET_PREVIOUS is re-encrypted with the current key on the way (rotation, README).
 */
export async function loadConnection(kind: ConnectionKind, ownerId?: string): Promise<StoredConnection | null> {
  const [row] = await db
    .select()
    .from(connections)
    .where(ownerId ? and(eq(connections.kind, kind), eq(connections.ownerId, ownerId)) : eq(connections.kind, kind))
    .orderBy(desc(connections.updatedAt))
    .limit(1);
  if (!row) return null;
  const opened = row.secretEnc ? openStoredSecret(row.secretEnc, { ownerId: row.ownerId, kind: row.kind, provider: row.provider }) : null;
  if (opened?.reencrypted) await storeReencrypted(row, opened.reencrypted);
  return toStored(row, opened);
}

/* ---------- writes ---------- */

export type SaveConnectionInput = {
  provider: string;
  config: Record<string, unknown>;
  /** `undefined` keeps the stored secret (when the provider is unchanged), `""`/`null` clears it. */
  secret?: string | null;
};

/**
 * Upserts the owner's connection. Always sets `ownerId` explicitly. Changing the provider drops a
 * kept secret (it belonged to the other provider and its AAD no longer matches); a kept secret is
 * re-encrypted with the current APP_SECRET (an unreadable one is kept as is, never destroyed).
 * Resets the verification state — the new settings haven't been tested.
 */
export async function saveConnection(ownerId: string, kind: ConnectionKind, input: SaveConnectionInput): Promise<void> {
  const [existing] = await db.select().from(connections).where(and(eq(connections.ownerId, ownerId), eq(connections.kind, kind)));
  let secretEnc: string | null = null;
  let hint: string | null = null;
  if (typeof input.secret === "string" && input.secret.trim()) {
    const value = input.secret.trim();
    secretEnc = encryptSecret(value, { ownerId, kind, provider: input.provider });
    hint = secretHint(value);
  } else if (input.secret === undefined && existing?.secretEnc && existing.provider === input.provider) {
    secretEnc = openStoredSecret(existing.secretEnc, { ownerId, kind, provider: input.provider }).reencrypted ?? existing.secretEnc;
    hint = existing.secretHint;
  }
  const values = { provider: input.provider, config: input.config, secretEnc, secretHint: hint, verifiedAt: null, lastError: null };
  await db
    .insert(connections)
    .values({ ownerId, kind, ...values })
    .onConflictDoUpdate({ target: [connections.ownerId, connections.kind], set: { ...values, updatedAt: new Date() } });
  clearConnectionCache();
}

/**
 * Records a connection test. Creates a placeholder row (provider only, no secret) when the tested
 * settings came from the environment and nothing is stored yet — a row without a secret never
 * resolves to an active connection, so this only carries the test result.
 */
export async function recordCheck(ownerId: string, kind: ConnectionKind, provider: string, check: Omit<ConnectionCheck, "at">): Promise<ConnectionCheck> {
  const full: ConnectionCheck = { ...check, at: new Date().toISOString() };
  const verifiedAt = full.ok ? new Date(full.at) : null;
  const lastError = full.ok ? null : (full.error ?? "Connection failed").slice(0, 500);
  await db
    .insert(connections)
    .values({ ownerId, kind, provider, config: { check: full }, verifiedAt, lastError })
    .onConflictDoUpdate({
      target: [connections.ownerId, connections.kind],
      // Keep the stored settings; only the bookkeeping changes (and updated_at stays meaningful).
      set: { config: sql`${connections.config} || ${JSON.stringify({ check: full })}::jsonb`, verifiedAt, lastError },
    });
  clearConnectionCache();
  return full;
}

/** Status of the active settings given the last check. */
export type ConnectionStatus = "verified" | "error" | "untested" | "off";

export function statusFor(active: { configured: boolean; source: ConnectionSource; fingerprint: string }, check: ConnectionCheck | null): ConnectionStatus {
  if (!active.configured) return "off";
  if (!check || check.source !== active.source || check.fingerprint !== active.fingerprint) return "untested";
  return check.ok ? "verified" : "error";
}

/** Reads a trimmed env var, treating "" as unset. */
export function envValue(env: Record<string, string | undefined>, name: string): string | undefined {
  const v = env[name]?.trim();
  return v ? v : undefined;
}
