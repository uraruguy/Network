import { describe, expect, it } from "vitest";
import { MFA_MAX_AGE_SECONDS, canManagePasskeys, isMfaSatisfied, passkeyRequired, signMfaCookie, verifyMfaCookie } from "./mfa";

const SECRET_A = "a".repeat(32) + "-secret-one";
const SECRET_B = "b".repeat(32) + "-secret-two";
const env = { APP_SECRET: SECRET_A };
const SUB = "114287d9-de5c-4ff5-a9b5-25d0785552e7";
const SESSION = "0b8c2f7e-6a51-4a4b-9d0e-3f1f0f6c1a11";
const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);

describe("MFA cookie", () => {
  it("verifies a freshly signed cookie", () => {
    const value = signMfaCookie(SUB, SESSION, { now: NOW, env });
    expect(value).toMatch(/^v1\.\d+\.[A-Za-z0-9_-]+$/);
    expect(verifyMfaCookie(value, SUB, SESSION, { now: NOW, env })).toBe(true);
  });

  it("rejects tampering", () => {
    const value = signMfaCookie(SUB, SESSION, { now: NOW, env });
    const [v, iat, sig] = value.split(".") as [string, string, string];
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    expect(verifyMfaCookie(`${v}.${iat}.${flipped}`, SUB, SESSION, { now: NOW, env })).toBe(false);
    expect(verifyMfaCookie(`${v}.${Number(iat) + 1}.${sig}`, SUB, SESSION, { now: NOW, env })).toBe(false);
    expect(verifyMfaCookie(`v2.${iat}.${sig}`, SUB, SESSION, { now: NOW, env })).toBe(false);
    expect(verifyMfaCookie(`${value}.extra`, SUB, SESSION, { now: NOW, env })).toBe(false);
    expect(verifyMfaCookie("garbage", SUB, SESSION, { now: NOW, env })).toBe(false);
    expect(verifyMfaCookie("", SUB, SESSION, { now: NOW, env })).toBe(false);
    expect(verifyMfaCookie(undefined, SUB, SESSION, { now: NOW, env })).toBe(false);
  });

  it("is bound to the user and the Supabase session", () => {
    const value = signMfaCookie(SUB, SESSION, { now: NOW, env });
    expect(verifyMfaCookie(value, SUB, "another-session", { now: NOW, env })).toBe(false);
    expect(verifyMfaCookie(value, "another-user", SESSION, { now: NOW, env })).toBe(false);
  });

  it("expires after 30 days and rejects future timestamps", () => {
    const value = signMfaCookie(SUB, SESSION, { now: NOW, env });
    expect(verifyMfaCookie(value, SUB, SESSION, { now: NOW + (MFA_MAX_AGE_SECONDS - 60) * 1000, env })).toBe(true);
    expect(verifyMfaCookie(value, SUB, SESSION, { now: NOW + (MFA_MAX_AGE_SECONDS + 1) * 1000, env })).toBe(false);
    const future = signMfaCookie(SUB, SESSION, { now: NOW + 10 * 60_000, env });
    expect(verifyMfaCookie(future, SUB, SESSION, { now: NOW, env })).toBe(false);
  });

  it("supports key rotation via APP_SECRET_PREVIOUS", () => {
    const old = signMfaCookie(SUB, SESSION, { now: NOW, env: { APP_SECRET: SECRET_A } });
    // Rotated: new secret signs, old secret still verifies.
    const rotated = { APP_SECRET: SECRET_B, APP_SECRET_PREVIOUS: SECRET_A };
    expect(verifyMfaCookie(old, SUB, SESSION, { now: NOW, env: rotated })).toBe(true);
    // After dropping the previous secret, old cookies stop working.
    expect(verifyMfaCookie(old, SUB, SESSION, { now: NOW, env: { APP_SECRET: SECRET_B } })).toBe(false);
    // New cookies are signed with the new secret only.
    const fresh = signMfaCookie(SUB, SESSION, { now: NOW, env: rotated });
    expect(verifyMfaCookie(fresh, SUB, SESSION, { now: NOW, env: { APP_SECRET: SECRET_A } })).toBe(false);
  });

  it("fails closed without a secret", () => {
    const value = signMfaCookie(SUB, SESSION, { now: NOW, env });
    expect(verifyMfaCookie(value, SUB, SESSION, { now: NOW, env: {} })).toBe(false);
    expect(verifyMfaCookie(value, SUB, SESSION, { now: NOW, env: { APP_SECRET: "too-short" } })).toBe(false);
    expect(() => signMfaCookie(SUB, SESSION, { env: {} })).toThrow(/APP_SECRET/);
  });
});

describe("policy", () => {
  const claims = { sub: SUB, sessionId: SESSION, aal: "aal1" as const, email: null, clientId: null, emailProofAt: null };

  it("requires a passkey unless explicitly disabled", () => {
    expect(passkeyRequired({})).toBe(true);
    expect(passkeyRequired({ AUTH_REQUIRE_PASSKEY: "true" })).toBe(true);
    expect(passkeyRequired({ AUTH_REQUIRE_PASSKEY: "0" })).toBe(true);
    expect(passkeyRequired({ AUTH_REQUIRE_PASSKEY: "false" })).toBe(false);
  });

  it("isMfaSatisfied checks the cookie only when required", () => {
    expect(isMfaSatisfied({ claims, cookie: null, env })).toBe(false);
    expect(isMfaSatisfied({ claims, cookie: null, env: { ...env, AUTH_REQUIRE_PASSKEY: "false" } })).toBe(true);
    const value = signMfaCookie(SUB, SESSION, { env });
    expect(isMfaSatisfied({ claims, cookie: value, env })).toBe(true);
  });

  it("lets a password session enroll only the first passkey", () => {
    expect(canManagePasskeys({ credentialCount: 0, mfaVerified: false })).toBe(true);
    expect(canManagePasskeys({ credentialCount: 1, mfaVerified: false })).toBe(false);
    expect(canManagePasskeys({ credentialCount: 2, mfaVerified: true })).toBe(true);
  });
});
