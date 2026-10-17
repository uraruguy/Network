import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { deriveKey, verificationKeys } from "./keys";

/**
 * Encryption for connection secrets (AI API keys, e-mail passwords) before they reach the DB.
 *
 *   token = "v1." + base64url(iv) + "." + base64url(tag) + "." + base64url(ciphertext)
 *
 * AES-256-GCM with a fresh 96-bit IV per value and a key derived from APP_SECRET for the
 * purpose "connections". The additional authenticated data binds a ciphertext to its row —
 * `ownerId:kind:provider` — so a value copied into another owner's row (or onto another provider)
 * fails to decrypt instead of silently working. During an APP_SECRET rotation, values written with
 * APP_SECRET_PREVIOUS still decrypt; re-saving a connection re-encrypts it with the current key.
 */

const VERSION = "v1";
const PURPOSE = "connections";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export type SecretContext = { ownerId: string; kind: string; provider: string };
type Env = Record<string, string | undefined>;

export class SecretDecryptError extends Error {
  constructor(message = "Could not decrypt the stored secret (was APP_SECRET changed?)") {
    super(message);
    this.name = "SecretDecryptError";
  }
}

/** The AAD string for a secret: `ownerId:kind:provider`. */
export function secretAad({ ownerId, kind, provider }: SecretContext): Buffer {
  return Buffer.from(`${ownerId}:${kind}:${provider}`, "utf8");
}

export function encryptSecret(plaintext: string, ctx: SecretContext, env: Env = process.env): string {
  const key = deriveKey(PURPOSE, env);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(secretAad(ctx));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

/** Decrypts a `v1.…` token. Throws `SecretDecryptError` on a malformed token, wrong AAD or unknown key. */
export function decryptSecret(token: string, ctx: SecretContext, env: Env = process.env): string {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new SecretDecryptError("Unrecognised secret format");
  const [, ivB64, tagB64, ctB64] = parts as [string, string, string, string];
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const ct = Buffer.from(ctB64, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new SecretDecryptError("Unrecognised secret format");
  const aad = secretAad(ctx);
  for (const key of verificationKeys(PURPOSE, env)) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
      decipher.setAAD(aad);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    } catch {
      // Try the next (previous) key.
    }
  }
  throw new SecretDecryptError();
}

/**
 * A display hint that never reveals enough to be useful: the key's type prefix and last four
 * characters ("sk-…a1b2", "re_…9fQx"). Short values (passwords) only show a mask.
 */
export function secretHint(secret: string): string {
  const s = secret.trim();
  if (s.length < 12) return "••••••••";
  const prefix = /^[a-z]{2,4}[-_]/i.exec(s)?.[0] ?? "";
  return `${prefix}…${s.slice(-4)}`;
}
