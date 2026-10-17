import { hkdfSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deriveKey, hkdfKey, verificationKeys } from "./keys";

const SECRET = "s".repeat(40);

describe("deriveKey (HKDF-SHA256)", () => {
  it("matches HKDF-SHA256(APP_SECRET, salt='', info='network:<purpose>:v1')", () => {
    const expected = Buffer.from(hkdfSync("sha256", SECRET, Buffer.alloc(0), "network:mfa:v1", 32));
    expect(deriveKey("mfa", { APP_SECRET: SECRET }).equals(expected)).toBe(true);
    expect(deriveKey("mfa", { APP_SECRET: SECRET })).toHaveLength(32);
  });

  it("is deterministic and purpose-separated", () => {
    expect(hkdfKey(SECRET, "mfa").equals(hkdfKey(SECRET, "mfa"))).toBe(true);
    expect(hkdfKey(SECRET, "mfa").equals(hkdfKey(SECRET, "webauthn"))).toBe(false);
    expect(hkdfKey(SECRET, "mfa").equals(hkdfKey("t".repeat(40), "mfa"))).toBe(false);
  });

  it("refuses a missing or short secret", () => {
    expect(() => deriveKey("mfa", {})).toThrow(/APP_SECRET/);
    expect(() => deriveKey("mfa", { APP_SECRET: "short" })).toThrow(/APP_SECRET/);
  });

  it("validates purposes", () => {
    expect(() => hkdfKey(SECRET, "")).toThrow();
    expect(() => hkdfKey(SECRET, "Bad Purpose")).toThrow();
    expect(() => hkdfKey(SECRET, "connections:ai")).not.toThrow();
  });

  it("verificationKeys includes the previous secret during rotation", () => {
    expect(verificationKeys("mfa", { APP_SECRET: SECRET })).toHaveLength(1);
    const keys = verificationKeys("mfa", { APP_SECRET: SECRET, APP_SECRET_PREVIOUS: "p".repeat(40) });
    expect(keys).toHaveLength(2);
    expect(keys[1]!.equals(hkdfKey("p".repeat(40), "mfa"))).toBe(true);
    // Ignored when identical or too short.
    expect(verificationKeys("mfa", { APP_SECRET: SECRET, APP_SECRET_PREVIOUS: SECRET })).toHaveLength(1);
    expect(verificationKeys("mfa", { APP_SECRET: SECRET, APP_SECRET_PREVIOUS: "short" })).toHaveLength(1);
  });
});
