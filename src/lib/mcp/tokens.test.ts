import { describe, expect, it } from "vitest";
import { hkdfKey } from "@/lib/crypto/keys";
import { accessOf, base62, generateToken, hashToken, looksLikePat, normalizeScopes, PAT_PATTERN, scopesFor, tokenPrefix } from "./tokens";

describe("personal access tokens", () => {
  it("look like ntk_ + 43 base62 characters and never repeat", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const t = generateToken();
      expect(t).toMatch(PAT_PATTERN);
      expect(looksLikePat(t)).toBe(true);
      seen.add(t);
    }
    expect(seen.size).toBe(200);
  });

  it("pads small random values to a fixed length", () => {
    expect(generateToken(() => new Uint8Array(32))).toBe(`ntk_${"0".repeat(43)}`);
    expect(generateToken(() => new Uint8Array(32).fill(255))).toMatch(PAT_PATTERN);
  });

  it("encodes base62 correctly", () => {
    expect(base62(new Uint8Array([0]))).toBe("0");
    expect(base62(new Uint8Array([61]))).toBe("z");
    expect(base62(new Uint8Array([62]))).toBe("10");
    expect(base62(new Uint8Array([1, 0]))).toBe("48"); // 256 = 4·62 + 8
  });

  it("hashes with a keyed HMAC (deterministic, key-dependent, hex)", () => {
    const key = hkdfKey("x".repeat(40), "pat-pepper");
    const other = hkdfKey("y".repeat(40), "pat-pepper");
    const t = generateToken();
    expect(hashToken(t, key)).toBe(hashToken(t, key));
    expect(hashToken(t, key)).not.toBe(hashToken(t, other));
    expect(hashToken(t, key)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t, key)).not.toContain(t.slice(4, 12));
  });

  it("shows a short, non-secret prefix", () => {
    expect(tokenPrefix("ntk_abcdefghijk")).toBe("ntk_abcdef");
  });
});

describe("scopes", () => {
  it("maps access levels to scopes and back", () => {
    expect(scopesFor("read")).toEqual(["network:read"]);
    expect(scopesFor("write")).toEqual(["network:read", "network:write"]);
    expect(accessOf(["network:read"])).toBe("read");
    expect(accessOf(["network:read", "network:write"])).toBe("write");
  });

  it("keeps known scopes only and lets write imply read", () => {
    expect(normalizeScopes(["network:write"])).toEqual(["network:read", "network:write"]);
    expect(normalizeScopes(["admin", "network:read", "network:read"])).toEqual(["network:read"]);
    expect(normalizeScopes(["openid", "email"])).toEqual([]);
    expect(normalizeScopes(null)).toEqual([]);
  });
});
