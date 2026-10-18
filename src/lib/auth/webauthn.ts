import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { deriveKey, verificationKeys } from "@/lib/crypto/keys";
import { clientEnv } from "@/lib/env";
import { getCredential, listCredentials, saveCredential, updateCounter } from "@/lib/data/passkeys";
import type { SessionClaims } from "./claims";

/**
 * WebAuthn ceremonies for the passkey second factor (SimpleWebAuthn). No UI and no routes here —
 * the sign-in UI calls these from its endpoints:
 *
 *   options:  const { options, challengeCookie } = await registrationOptions(claims)
 *             → set CHALLENGE_COOKIE = challengeCookie (challengeCookieOptions), return options
 *   verify:   await verifyRegistration({ claims, response, challengeCookie, name })
 *             → clear CHALLENGE_COOKIE, then setMfaCookie(res.cookies, claims)
 *
 * Enrollment rule (see canManagePasskeys in ./mfa): with zero credentials a password session may
 * enroll; otherwise the caller must already be passkey-verified. Endpoints enforce it.
 *
 * The challenge travels in an HMAC-signed, 5-minute cookie bound to the user, the Supabase session
 * and the ceremony type, so no server-side challenge store is needed.
 */

export const CHALLENGE_COOKIE = "__Host-network-webauthn";
const CHALLENGE_TTL_SECONDS = 5 * 60;
export const challengeCookieOptions = { httpOnly: true, secure: true, sameSite: "strict" as const, path: "/", maxAge: CHALLENGE_TTL_SECONDS };

type Ceremony = "register" | "authenticate";

/** Relying party derived from the app's public URL (or the request origin in development). */
export function relyingParty(origin: string = clientEnv.NEXT_PUBLIC_APP_URL) {
  const url = new URL(origin);
  return { rpID: url.hostname, rpName: "The Network", origin: url.origin };
}

function challengeMac(key: Buffer, ceremony: Ceremony, claims: Pick<SessionClaims, "sub" | "sessionId">, exp: number, challenge: string) {
  return createHmac("sha256", key).update(`${ceremony}|${claims.sub}|${claims.sessionId}|${exp}|${challenge}`).digest("base64url");
}

export function signChallenge(ceremony: Ceremony, claims: Pick<SessionClaims, "sub" | "sessionId">, challenge: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + CHALLENGE_TTL_SECONDS;
  return `${ceremony}.${exp}.${challenge}.${challengeMac(deriveKey("webauthn"), ceremony, claims, exp, challenge)}`;
}

/** Returns the challenge if the cookie is authentic, unexpired and for this ceremony + session. */
export function readChallenge(cookie: string | null | undefined, ceremony: Ceremony, claims: Pick<SessionClaims, "sub" | "sessionId">, now = Date.now()): string | null {
  if (!cookie) return null;
  const [c, expRaw, challenge, sig, ...rest] = cookie.split(".");
  if (rest.length || c !== ceremony || !expRaw || !challenge || !sig || !/^\d+$/.test(expRaw)) return null;
  const exp = Number(expRaw);
  if (exp < Math.floor(now / 1000)) return null;
  const given = Buffer.from(sig);
  const ok = verificationKeys("webauthn").some((key) => {
    const expected = Buffer.from(challengeMac(key, ceremony, claims, exp, challenge));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
  return ok ? challenge : null;
}

export async function registrationOptions(claims: SessionClaims, origin?: string) {
  const rp = relyingParty(origin);
  const existing = await listCredentials(claims.sub);
  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpID,
    userName: claims.email ?? "owner",
    userID: new TextEncoder().encode(claims.sub),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  return { options, challengeCookie: signChallenge("register", claims, options.challenge) };
}

export async function verifyRegistration(input: { claims: SessionClaims; response: RegistrationResponseJSON; challengeCookie: string | undefined; name?: string | null; origin?: string }) {
  const expectedChallenge = readChallenge(input.challengeCookie, "register", input.claims);
  if (!expectedChallenge) return { ok: false as const, reason: "challenge" as const };
  const rp = relyingParty(input.origin);
  const result = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
    requireUserVerification: false,
  });
  if (!result.verified) return { ok: false as const, reason: "verification" as const };
  const info = result.registrationInfo;
  const credential = await saveCredential(input.claims.sub, {
    id: info.credential.id,
    publicKey: info.credential.publicKey,
    counter: info.credential.counter,
    transports: info.credential.transports ?? input.response.response.transports ?? [],
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
    name: input.name,
  });
  return { ok: true as const, credential };
}

export async function authenticationOptions(claims: SessionClaims, origin?: string) {
  const rp = relyingParty(origin);
  const existing = await listCredentials(claims.sub);
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    allowCredentials: existing.map((c) => ({ id: c.id, transports: c.transports })),
    userVerification: "preferred",
  });
  return { options, challengeCookie: signChallenge("authenticate", claims, options.challenge), credentialCount: existing.length };
}

export async function verifyAuthentication(input: { claims: SessionClaims; response: AuthenticationResponseJSON; challengeCookie: string | undefined; origin?: string }) {
  const expectedChallenge = readChallenge(input.challengeCookie, "authenticate", input.claims);
  if (!expectedChallenge) return { ok: false as const, reason: "challenge" as const };
  // Only this owner's credentials can satisfy the assertion.
  const stored = await getCredential(input.claims.sub, input.response.id);
  if (!stored) return { ok: false as const, reason: "unknown_credential" as const };
  const rp = relyingParty(input.origin);
  const result = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
    credential: { id: stored.id, publicKey: new Uint8Array(stored.publicKey), counter: stored.counter, transports: stored.transports },
    requireUserVerification: false,
  });
  if (!result.verified) return { ok: false as const, reason: "verification" as const };
  await updateCounter(input.claims.sub, stored.id, result.authenticationInfo.newCounter);
  return { ok: true as const, credentialId: stored.id };
}
