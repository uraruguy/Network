import { createHmac, timingSafeEqual } from "node:crypto";
import { verificationKeys, deriveKey } from "@/lib/crypto/keys";
import type { SessionClaims } from "./claims";

/**
 * Passkey second factor — session binding.
 *
 * Supabase handles the password step (aal1). After the owner proves a passkey, the server sets an
 * HMAC-signed cookie bound to the Supabase `session_id`. The proxy and every API handler require
 * that cookie (unless AUTH_REQUIRE_PASSKEY=false). Signing out or a new sign-in creates a new
 * session id, which invalidates the cookie automatically.
 *
 * Cookie value: `v1.<issuedAtSeconds>.<base64url HMAC-SHA256(key, "v1|sub|sessionId|issuedAt")>`
 * with key = HKDF(APP_SECRET, "network:mfa:v1").
 */

export const MFA_COOKIE = "__Host-network-mfa";
export const MFA_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const CLOCK_SKEW_SECONDS = 60;

/** Production default: passkey required. Local dev may set AUTH_REQUIRE_PASSKEY=false. */
export function passkeyRequired(env: Record<string, string | undefined> = process.env): boolean {
  return env.AUTH_REQUIRE_PASSKEY !== "false";
}

function mac(key: Buffer, sub: string, sessionId: string, issuedAt: number) {
  return createHmac("sha256", key).update(`v1|${sub}|${sessionId}|${issuedAt}`).digest("base64url");
}

export function signMfaCookie(sub: string, sessionId: string, opts: { now?: number; env?: Record<string, string | undefined> } = {}): string {
  const issuedAt = Math.floor((opts.now ?? Date.now()) / 1000);
  return `v1.${issuedAt}.${mac(deriveKey("mfa", opts.env), sub, sessionId, issuedAt)}`;
}

export function verifyMfaCookie(
  value: string | null | undefined,
  sub: string,
  sessionId: string,
  opts: { now?: number; env?: Record<string, string | undefined> } = {},
): boolean {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !/^\d{1,12}$/.test(parts[1]!)) return false;
  const issuedAt = Number(parts[1]);
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (issuedAt > now + CLOCK_SKEW_SECONDS || now - issuedAt > MFA_MAX_AGE_SECONDS) return false;

  const given = Buffer.from(parts[2]!, "utf8");
  let keys: Buffer[];
  try {
    keys = verificationKeys("mfa", opts.env);
  } catch {
    return false; // no APP_SECRET: nothing can be verified
  }
  return keys.some((key) => {
    const expected = Buffer.from(mac(key, sub, sessionId, issuedAt), "utf8");
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}

/** True when the session may access the app: passkey proven for this session (or not required). */
export function isMfaSatisfied({ claims, cookie, env }: { claims: SessionClaims; cookie: string | null | undefined; env?: Record<string, string | undefined> }): boolean {
  if (!passkeyRequired(env)) return true;
  return verifyMfaCookie(cookie, claims.sub, claims.sessionId, { env });
}

/** Cookie attributes. `__Host-` requires Secure + Path=/ + no Domain (browsers allow Secure on http://localhost). */
export const mfaCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: MFA_MAX_AGE_SECONDS,
};

type CookieJar = { set(name: string, value: string, options: typeof mfaCookieOptions): unknown };

/** Marks the current session as passkey-verified (call after a successful WebAuthn assertion). */
export function setMfaCookie(jar: CookieJar, claims: Pick<SessionClaims, "sub" | "sessionId">) {
  jar.set(MFA_COOKIE, signMfaCookie(claims.sub, claims.sessionId), mfaCookieOptions);
}

export function clearMfaCookie(jar: CookieJar) {
  jar.set(MFA_COOKIE, "", { ...mfaCookieOptions, maxAge: 0 });
}

/**
 * Who may add or remove passkeys: with none enrolled yet, the password session may enroll the
 * first one (bootstrap); afterwards only a passkey-verified session may change them.
 */
export function canManagePasskeys({ credentialCount, mfaVerified }: { credentialCount: number; mfaVerified: boolean }): boolean {
  return credentialCount === 0 || mfaVerified;
}
