import "server-only";
import { createHmac, randomInt } from "node:crypto";
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { deriveKey, verificationKeys } from "@/lib/crypto/keys";

/**
 * Storage for the passkey second factor: WebAuthn credentials and one-time recovery codes.
 * Ceremony logic (options/verification) lives in src/lib/auth/webauthn.ts.
 */

const { webauthnCredentials: creds, mfaRecoveryCodes: codes } = schema;

/** Public view of a credential (no key material). */
const publicColumns = {
  id: creds.id,
  name: creds.name,
  deviceType: creds.deviceType,
  backedUp: creds.backedUp,
  transports: creds.transports,
  createdAt: creds.createdAt,
  lastUsedAt: creds.lastUsedAt,
};

export type PasskeySummary = { id: string; name: string | null; deviceType: string | null; backedUp: boolean; transports: string[]; createdAt: Date; lastUsedAt: Date | null };

export function listCredentials(ownerId: string): Promise<PasskeySummary[]> {
  return db.select(publicColumns).from(creds).where(eq(creds.ownerId, ownerId)).orderBy(asc(creds.createdAt));
}

/** Full credential including the public key, for verifying an assertion. */
export async function getCredential(ownerId: string, id: string) {
  const [row] = await db.select().from(creds).where(and(eq(creds.ownerId, ownerId), eq(creds.id, id))).limit(1);
  return row ?? null;
}

export async function countCredentials(ownerId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(creds).where(eq(creds.ownerId, ownerId));
  return row?.n ?? 0;
}

export async function saveCredential(
  ownerId: string,
  input: { id: string; publicKey: Uint8Array; counter: number; transports?: string[]; deviceType?: string | null; backedUp?: boolean; name?: string | null },
): Promise<PasskeySummary> {
  const [row] = await db
    .insert(creds)
    .values({
      ownerId,
      id: input.id,
      publicKey: Buffer.from(input.publicKey),
      counter: input.counter,
      transports: input.transports ?? [],
      deviceType: input.deviceType ?? null,
      backedUp: input.backedUp ?? false,
      name: input.name?.trim() || null,
    })
    .returning(publicColumns);
  return row!;
}

/** Records a successful assertion: new signature counter + last used time. */
export async function updateCounter(ownerId: string, id: string, counter: number) {
  await db.update(creds).set({ counter, lastUsedAt: new Date() }).where(and(eq(creds.ownerId, ownerId), eq(creds.id, id)));
}

export async function renameCredential(ownerId: string, id: string, name: string) {
  const [row] = await db
    .update(creds)
    .set({ name: name.trim() || null })
    .where(and(eq(creds.ownerId, ownerId), eq(creds.id, id)))
    .returning(publicColumns);
  return row ?? null;
}

export async function deleteCredential(ownerId: string, id: string): Promise<boolean> {
  const rows = await db.delete(creds).where(and(eq(creds.ownerId, ownerId), eq(creds.id, id))).returning({ id: creds.id });
  return rows.length > 0;
}

/* ------------------------------------------------------------------ */
/*  Recovery codes                                                     */
/* ------------------------------------------------------------------ */

// Crockford-style alphabet without look-alikes (no 0/O, 1/I/L, U).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const RECOVERY_CODE_COUNT = 10;

/** Uppercases and strips separators so "abcd-efgh-jkmn" and "ABCD EFGH JKMN" are the same code. */
export function normalizeRecoveryCode(code: string) {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function hashCode(key: Buffer, code: string) {
  return createHmac("sha256", key).update(normalizeRecoveryCode(code)).digest("base64url");
}

function newCode() {
  let s = "";
  for (let i = 0; i < 12; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

/**
 * Replaces all recovery codes with a fresh set. Returns the plaintext codes — the only time they
 * exist outside the user's hands; only keyed hashes (HMAC with an APP_SECRET-derived key) are stored.
 */
export async function generateRecoveryCodes(ownerId: string, n = RECOVERY_CODE_COUNT): Promise<string[]> {
  const plain = Array.from({ length: n }, newCode);
  const key = deriveKey("recovery-codes");
  await db.transaction(async (tx) => {
    await tx.delete(codes).where(eq(codes.ownerId, ownerId));
    await tx.insert(codes).values(plain.map((c) => ({ ownerId, codeHash: hashCode(key, c) })));
  });
  return plain;
}

/** Atomically marks a matching unused code as used. True if the code was valid. */
export async function consumeRecoveryCode(ownerId: string, code: string): Promise<boolean> {
  if (normalizeRecoveryCode(code).length !== 12) return false;
  const hashes = verificationKeys("recovery-codes").map((k) => hashCode(k, code));
  const rows = await db
    .update(codes)
    .set({ usedAt: sql`now()` })
    .where(and(eq(codes.ownerId, ownerId), inArray(codes.codeHash, hashes), isNull(codes.usedAt)))
    .returning({ id: codes.id });
  return rows.length > 0;
}

export async function countUnusedRecoveryCodes(ownerId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(codes).where(and(eq(codes.ownerId, ownerId), isNull(codes.usedAt)));
  return row?.n ?? 0;
}
