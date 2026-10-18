import { describe, expect, it } from "vitest";
import { normalizeRecoveryCode } from "@/lib/data/passkeys";
import { readChallenge, relyingParty, signChallenge } from "./webauthn";

const claims = { sub: "114287d9-de5c-4ff5-a9b5-25d0785552e7", sessionId: "0b8c2f7e-6a51-4a4b-9d0e-3f1f0f6c1a11" };
const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);

describe("WebAuthn challenge cookie", () => {
  it("round-trips for the same ceremony and session", () => {
    const cookie = signChallenge("register", claims, "abc_DEF-123", NOW);
    expect(readChallenge(cookie, "register", claims, NOW)).toBe("abc_DEF-123");
  });

  it("rejects other ceremonies, sessions, expiry and tampering", () => {
    const cookie = signChallenge("register", claims, "abc", NOW);
    expect(readChallenge(cookie, "authenticate", claims, NOW)).toBeNull();
    expect(readChallenge(cookie, "register", { ...claims, sessionId: "other" }, NOW)).toBeNull();
    expect(readChallenge(cookie, "register", claims, NOW + 6 * 60_000)).toBeNull();
    expect(readChallenge(cookie.replace(".abc.", ".abd."), "register", claims, NOW)).toBeNull();
    expect(readChallenge(undefined, "register", claims, NOW)).toBeNull();
    expect(readChallenge("register.1.x", "register", claims, NOW)).toBeNull();
  });
});

describe("relyingParty", () => {
  it("derives rpID and origin from the app URL", () => {
    expect(relyingParty("https://network.example.com/some/path")).toEqual({ rpID: "network.example.com", rpName: "The Network", origin: "https://network.example.com" });
    expect(relyingParty("http://localhost:3102")).toMatchObject({ rpID: "localhost", origin: "http://localhost:3102" });
  });
});

describe("recovery codes", () => {
  it("normalises case and separators", () => {
    expect(normalizeRecoveryCode("abcd-efgh-jkmn")).toBe("ABCDEFGHJKMN");
    expect(normalizeRecoveryCode(" ABCD EFGH JKMN ")).toBe("ABCDEFGHJKMN");
  });
});
