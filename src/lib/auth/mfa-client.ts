"use client";
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
  WebAuthnError,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { biometricFor, detectPlatform, deviceName, type Biometric, type Platform } from "@/lib/security/platform";
import type { EnrollResult, SecurityOverview } from "@/lib/security/types";

export type { Biometric, Platform };

/**
 * Browser side of the passkey second factor: platform wording ("Face ID" / "Touch ID"), the
 * WebAuthn ceremonies against /api/auth/*, and friendly error messages. Server counterpart:
 * src/lib/auth/webauthn.ts + src/app/api/auth/**.
 *
 * Ceremonies must start from an explicit tap: Safari only allows WebAuthn close to a user
 * gesture, so fetch options ahead of time (`fetchAuthenticationOptions`) and pass them in.
 */

/* ------------------------------------------------------------------ */
/*  Capabilities                                                       */
/* ------------------------------------------------------------------ */

export type PasskeyEnvironment = { supported: boolean; platform: Platform; biometric: Biometric; deviceName: string };

/** Capabilities of this browser/device. Safe to call during effects only (uses navigator). */
export async function passkeyEnvironment(): Promise<PasskeyEnvironment> {
  const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
  const supported = browserSupportsWebAuthn();
  const uvpa = supported ? await platformAuthenticatorIsAvailable().catch(() => false) : false;
  return { supported, platform, biometric: biometricFor(platform, uvpa), deviceName: deviceName(platform) };
}

/* ------------------------------------------------------------------ */
/*  Ceremonies                                                         */
/* ------------------------------------------------------------------ */

/** Request options + challenge cookie (valid 5 minutes). Fetch before the user taps. */
export function fetchAuthenticationOptions() {
  return api.post<PublicKeyCredentialRequestOptionsJSON>("/api/auth/webauthn/authenticate/options");
}

/** Proves a passkey for this session. Throws on cancel/failure (see `describePasskeyError`). */
export async function verifyWithPasskey(options?: PublicKeyCredentialRequestOptionsJSON): Promise<void> {
  const optionsJSON = options ?? (await fetchAuthenticationOptions());
  const response = await startAuthentication({ optionsJSON });
  await api.post("/api/auth/webauthn/authenticate/verify", { response });
}

/** Creation options + challenge cookie (valid 5 minutes). Fetch before the user taps where possible. */
export function fetchRegistrationOptions() {
  return api.post<PublicKeyCredentialCreationOptionsJSON>("/api/auth/webauthn/register/options");
}

/** Creates and stores a new passkey. The first one also returns the recovery codes (show once). */
export async function enrollPasskey(name: string, options?: PublicKeyCredentialCreationOptionsJSON): Promise<EnrollResult> {
  const optionsJSON = options ?? (await fetchRegistrationOptions());
  const response = await startRegistration({ optionsJSON });
  return api.post<EnrollResult>("/api/auth/webauthn/register/verify", { response, name });
}

/** Verifies this session with a one-time recovery code. */
export function redeemRecoveryCode(code: string) {
  return api.post<{ ok: true; remaining: number }>("/api/auth/recovery", { code });
}

/** True when the user dismissed the system sheet (or it timed out) — not worth an alarming error. */
export function isPasskeyCancel(err: unknown): boolean {
  if (err instanceof WebAuthnError) return err.code === "ERROR_CEREMONY_ABORTED" || err.name === "NotAllowedError" || err.name === "AbortError";
  return err instanceof Error && (err.name === "NotAllowedError" || err.name === "AbortError");
}

/** A calm, actionable sentence for any ceremony error. */
export function describePasskeyError(err: unknown, biometric: Biometric = "passkey"): string {
  const thing = biometric === "passkey" ? "The passkey request" : biometric;
  if (isPasskeyCancel(err)) return `${thing} was cancelled or timed out. Try again when you're ready.`;
  if (err instanceof WebAuthnError) {
    if (err.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") return "This device already has a passkey for The Network.";
    if (err.code === "ERROR_INVALID_DOMAIN" || err.code === "ERROR_INVALID_RP_ID") return "Passkeys only work on the app's own address.";
  }
  if (err instanceof ApiError) {
    if (err.code === "challenge_expired") return "That took a little too long. Try again.";
    if (err.code === "unauthenticated") return "Your sign-in expired. Sign in again.";
    return err.message;
  }
  if (err instanceof TypeError) return "You seem to be offline. Check your connection and try again.";
  return "Something went wrong. Try again.";
}

/* ------------------------------------------------------------------ */
/*  Settings data                                                      */
/* ------------------------------------------------------------------ */

/** Query keys for the security screens (kept local: lib/queries/keys.ts is shared). */
export const securityKeys = { overview: ["security", "overview"] as const };

export function useSecurityOverview({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: securityKeys.overview,
    queryFn: () => api.get<SecurityOverview>("/api/security"),
    staleTime: 5 * 60_000,
    enabled,
    // Passkeys, sessions and sign-in history stay off the device's disk.
    meta: { persist: false },
  });
}
