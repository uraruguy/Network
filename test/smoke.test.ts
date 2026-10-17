import { describe, expect, it } from "vitest";
import { WARMTH } from "@/lib/constants";

describe("test setup", () => {
  it("resolves the @ alias", () => {
    expect(WARMTH).toContain("inner");
  });
});
