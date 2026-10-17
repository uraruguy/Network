import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, SecretDecryptError, secretHint } from "./secrets";

const A = "a".repeat(40);
const B = "b".repeat(40);
const ctx = { ownerId: "11111111-1111-4111-8111-111111111111", kind: "ai", provider: "openrouter" };

describe("connection secrets (AES-256-GCM)", () => {
  it("round-trips and uses the v1.<iv>.<tag>.<ct> format", () => {
    const token = encryptSecret("sk-or-v1-secret-value", ctx, { APP_SECRET: A });
    expect(token).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(token).not.toContain("secret-value");
    expect(decryptSecret(token, ctx, { APP_SECRET: A })).toBe("sk-or-v1-secret-value");
  });

  it("uses a fresh IV every time", () => {
    const t1 = encryptSecret("same", ctx, { APP_SECRET: A });
    const t2 = encryptSecret("same", ctx, { APP_SECRET: A });
    expect(t1).not.toBe(t2);
    expect(t1.split(".")[1]).not.toBe(t2.split(".")[1]);
  });

  it("fails when the AAD (owner / kind / provider) does not match", () => {
    const token = encryptSecret("x", ctx, { APP_SECRET: A });
    expect(() => decryptSecret(token, { ...ctx, ownerId: "22222222-2222-4222-8222-222222222222" }, { APP_SECRET: A })).toThrow(SecretDecryptError);
    expect(() => decryptSecret(token, { ...ctx, kind: "email" }, { APP_SECRET: A })).toThrow(SecretDecryptError);
    expect(() => decryptSecret(token, { ...ctx, provider: "anthropic" }, { APP_SECRET: A })).toThrow(SecretDecryptError);
  });

  it("fails on a wrong key or a tampered token", () => {
    const token = encryptSecret("x", ctx, { APP_SECRET: A });
    expect(() => decryptSecret(token, ctx, { APP_SECRET: B })).toThrow(SecretDecryptError);
    const [v, iv, tag, ct] = token.split(".");
    const flipped = Buffer.from(ct!, "base64url");
    flipped[0] = flipped[0]! ^ 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64url")].join("."), ctx, { APP_SECRET: A })).toThrow(SecretDecryptError);
    expect(() => decryptSecret("v2.a.b.c", ctx, { APP_SECRET: A })).toThrow(SecretDecryptError);
    expect(() => decryptSecret("garbage", ctx, { APP_SECRET: A })).toThrow(SecretDecryptError);
  });

  it("still decrypts values written with APP_SECRET_PREVIOUS during a rotation", () => {
    const old = encryptSecret("rotate-me", ctx, { APP_SECRET: A });
    expect(decryptSecret(old, ctx, { APP_SECRET: B, APP_SECRET_PREVIOUS: A })).toBe("rotate-me");
    // New writes use the new key only.
    const fresh = encryptSecret("rotate-me", ctx, { APP_SECRET: B, APP_SECRET_PREVIOUS: A });
    expect(decryptSecret(fresh, ctx, { APP_SECRET: B })).toBe("rotate-me");
    expect(() => decryptSecret(fresh, ctx, { APP_SECRET: A })).toThrow(SecretDecryptError);
  });

  it("refuses to encrypt without APP_SECRET", () => {
    expect(() => encryptSecret("x", ctx, {})).toThrow(/APP_SECRET/);
  });

  it("hints never reveal more than a prefix and the last four characters", () => {
    expect(secretHint("sk-ant-api03-abcdefghijklmnopa1b2")).toBe("sk-…a1b2");
    expect(secretHint("re_123456789abcdefXYZ9")).toBe("re_…XYZ9");
    expect(secretHint("plainlongtoken123456")).toBe("…3456");
    expect(secretHint("hunter2")).toBe("••••••••");
  });
});
