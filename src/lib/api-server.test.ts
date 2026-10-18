import { describe, expect, it } from "vitest";
import { sessionVerdict } from "./api-server";

const OWNER = "114287d9-de5c-4ff5-a9b5-25d0785552e7";

describe("sessionVerdict (withOwner fresh check)", () => {
  it("is alive when Auth returns the same user", () => {
    expect(sessionVerdict(OWNER, OWNER, null)).toBe("alive");
  });

  it("ended: revoked session, signed out elsewhere, no session, another user", () => {
    expect(sessionVerdict(OWNER, null, { name: "AuthApiError", status: 403 })).toBe("ended"); // session_not_found
    expect(sessionVerdict(OWNER, null, { name: "AuthApiError", status: 400 })).toBe("ended"); // refresh_token_not_found
    expect(sessionVerdict(OWNER, null, { name: "AuthSessionMissingError", status: 400 })).toBe("ended");
    expect(sessionVerdict(OWNER, "someone-else", null)).toBe("ended");
    expect(sessionVerdict(OWNER, null, null)).toBe("ended");
  });

  it("unavailable: network failures, rate limits and Auth outages (retry, don't sign out)", () => {
    expect(sessionVerdict(OWNER, null, { name: "AuthRetryableFetchError", status: 0 })).toBe("unavailable");
    expect(sessionVerdict(OWNER, null, { name: "AuthApiError", status: 429 })).toBe("unavailable");
    expect(sessionVerdict(OWNER, null, { name: "AuthApiError", status: 502 })).toBe("unavailable");
    expect(sessionVerdict(OWNER, null, { name: "AuthUnknownError" })).toBe("unavailable");
  });
});
