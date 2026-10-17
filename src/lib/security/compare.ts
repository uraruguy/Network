import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison for secrets (bearer tokens, cron secrets).
 *
 * Both sides are hashed first so the comparison runs over equal-length buffers: the time taken
 * reveals neither the secret's content nor its length. Empty or missing values never match.
 */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/** Extracts the token from an `Authorization: Bearer <token>` header (case-insensitive scheme). */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(header);
  return m ? m[1]! : null;
}
