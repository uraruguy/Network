import { describe, expect, it } from "vitest";
import { safeNext } from "./redirect";

const ORIGIN = "https://network.example.com";

describe("safeNext", () => {
  it("keeps same-origin paths with query and hash", () => {
    expect(safeNext("/people", ORIGIN)).toBe("/people");
    expect(safeNext("/people?q=ana&category=x", ORIGIN)).toBe("/people?q=ana&category=x");
    expect(safeNext("/people/1#notes", ORIGIN)).toBe("/people/1#notes");
    expect(safeNext("/oauth/consent?client_id=abc&redirect_uri=https%3A%2F%2Fclaude.ai", ORIGIN)).toBe(
      "/oauth/consent?client_id=abc&redirect_uri=https%3A%2F%2Fclaude.ai",
    );
  });

  it("falls back for missing or empty values", () => {
    expect(safeNext(null, ORIGIN)).toBe("/today");
    expect(safeNext(undefined, ORIGIN)).toBe("/today");
    expect(safeNext("", ORIGIN)).toBe("/today");
    expect(safeNext(null, ORIGIN, "/people")).toBe("/people");
  });

  it.each([
    "https://evil.com",
    "http://evil.com/today",
    "//evil.com",
    "//evil.com/today",
    "/\\evil.com",
    "\\\\evil.com",
    "/\\/evil.com",
    "/today\\..\\evil",
    "javascript:alert(1)",
    "data:text/html,hi",
    "today",
    "/\t/evil.com",
    "/\n/evil.com",
    "/ /evil.com",
    " /today",
    "/%0a",
  ])("rejects %j", (bad) => {
    const out = safeNext(bad, ORIGIN);
    expect(out === "/today" || out === "/%0a").toBe(true);
    expect(out.startsWith("//")).toBe(false);
  });

  it("does not loop back into the sign-in flow", () => {
    expect(safeNext("/login", ORIGIN)).toBe("/today");
    expect(safeNext("/login/verify?next=/people", ORIGIN)).toBe("/today");
    expect(safeNext("/auth/callback?code=1", ORIGIN)).toBe("/today");
  });

  it("normalises dot segments without leaving the origin", () => {
    expect(safeNext("/a/../people", ORIGIN)).toBe("/people");
    expect(safeNext("/../../etc/passwd", ORIGIN)).toBe("/etc/passwd");
  });

  it("rejects very long values", () => {
    expect(safeNext("/" + "a".repeat(5000), ORIGIN)).toBe("/today");
  });
});
