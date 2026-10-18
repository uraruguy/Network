import { hkdfSync } from "node:crypto";

/**
 * Purpose-bound keys derived from one root secret.
 *
 *   key = HKDF-SHA256(ikm = APP_SECRET, salt = "", info = "network:<purpose>:v1", 32 bytes)
 *
 * Every feature asks for its own purpose ("mfa", "webauthn", "connections" …), so a key leaked or
 * misused in one place is useless everywhere else. To rotate APP_SECRET, move the old value to
 * APP_SECRET_PREVIOUS: new signatures use the new key, verification accepts both.
 *
 * Generate a secret with:  openssl rand -base64 48
 */

export const MIN_SECRET_LENGTH = 32;

export class MissingSecretError extends Error {
  constructor() {
    super(`APP_SECRET is not set (or shorter than ${MIN_SECRET_LENGTH} characters). Generate one with: openssl rand -base64 48`);
    this.name = "MissingSecretError";
  }
}

function valid(secret: string | undefined): secret is string {
  return typeof secret === "string" && secret.length >= MIN_SECRET_LENGTH;
}

/** HKDF-SHA256 of `secret` for `purpose`. Pure; exported for tests and for callers with their own secret. */
export function hkdfKey(secret: string, purpose: string): Buffer {
  if (!/^[a-z0-9][a-z0-9:_-]*$/.test(purpose)) throw new Error(`Invalid key purpose: ${purpose}`);
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.alloc(0), Buffer.from(`network:${purpose}:v1`, "utf8"), 32));
}

/** The current key for `purpose`. Throws if APP_SECRET is missing or too short. */
export function deriveKey(purpose: string, env: Record<string, string | undefined> = process.env): Buffer {
  const secret = env.APP_SECRET;
  if (!valid(secret)) throw new MissingSecretError();
  return hkdfKey(secret, purpose);
}

/** Keys accepted when verifying: current first, then the previous secret's key (during rotation). */
export function verificationKeys(purpose: string, env: Record<string, string | undefined> = process.env): Buffer[] {
  const keys = [deriveKey(purpose, env)];
  if (valid(env.APP_SECRET_PREVIOUS) && env.APP_SECRET_PREVIOUS !== env.APP_SECRET) keys.push(hkdfKey(env.APP_SECRET_PREVIOUS, purpose));
  return keys;
}
