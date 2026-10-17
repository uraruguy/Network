import { describe, expect, it } from "vitest";
import { bearerToken, safeEqual } from "./compare";

describe("safeEqual", () => {
  it("matches identical strings only", () => {
    expect(safeEqual("s3cret-token-value", "s3cret-token-value")).toBe(true);
    expect(safeEqual("s3cret-token-value", "s3cret-token-valuE")).toBe(false);
    expect(safeEqual("short", "a much longer string")).toBe(false); // different lengths: no throw
    expect(safeEqual("ünïcode", "ünïcode")).toBe(true);
  });

  it("never matches empty or missing values", () => {
    expect(safeEqual("", "")).toBe(false);
    expect(safeEqual(null, null)).toBe(false);
    expect(safeEqual(undefined, "x")).toBe(false);
    expect(safeEqual("x", null)).toBe(false);
  });
});

describe("bearerToken", () => {
  it("extracts the token", () => {
    expect(bearerToken("Bearer abc.def-123")).toBe("abc.def-123");
    expect(bearerToken("bearer abc")).toBe("abc");
    expect(bearerToken("Bearer   abc  ")).toBe("abc");
  });

  it("rejects other schemes and malformed headers", () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken("")).toBeNull();
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken("Bearer")).toBeNull();
    expect(bearerToken("Bearer a b")).toBeNull();
    expect(bearerToken("Bearerabc")).toBeNull();
  });
});
