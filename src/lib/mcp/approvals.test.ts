import { describe, expect, it } from "vitest";
import { APPROVAL_SKEW_MS, APPROVAL_WINDOW_MS, approvalWindow, isApprovedSession, oauthSessionStart } from "./approvals";

describe("oauthSessionStart", () => {
  it("reads the code-exchange entry of amr (unix seconds)", () => {
    expect(oauthSessionStart([{ method: "oauth_provider/authorization_code", timestamp: 1_792_000_000 }])).toEqual(new Date(1_792_000_000_000));
  });

  it("ignores other methods and takes the latest exchange", () => {
    const amr = [
      { method: "password", timestamp: 1_792_000_500 },
      { method: "oauth_provider/authorization_code", timestamp: 1_792_000_000 },
      { method: "oauth_provider/authorization_code", timestamp: 1_792_000_100 },
    ];
    expect(oauthSessionStart(amr)).toEqual(new Date(1_792_000_100_000));
  });

  it("is the same for a token and its refresh (real Supabase amr, GoTrue v2.196)", () => {
    const issued = [{ method: "oauth_provider/authorization_code", timestamp: 1_792_358_960 }];
    const refreshed = [{ method: "oauth_provider/authorization_code", timestamp: 1_792_358_960 }]; // iat moved on, amr didn't
    expect(oauthSessionStart(refreshed)).toEqual(oauthSessionStart(issued));
    expect(oauthSessionStart(issued)).toEqual(new Date("2026-10-18T21:29:20Z"));
  });

  it("is null when the token doesn't say", () => {
    expect(oauthSessionStart(undefined)).toBeNull();
    expect(oauthSessionStart([{ method: "password", timestamp: 1 }])).toBeNull();
    expect(oauthSessionStart([{ method: "oauth_provider/authorization_code", timestamp: "soon" }])).toBeNull();
    expect(oauthSessionStart("oauth_provider/authorization_code")).toBeNull();
  });
});

describe("approval window", () => {
  const start = new Date("2026-10-18T12:00:00Z");

  it("reaches back the code lifetime and forward by the skew", () => {
    const { from, to } = approvalWindow(start);
    expect(start.getTime() - from.getTime()).toBe(APPROVAL_WINDOW_MS);
    expect(to.getTime() - start.getTime()).toBe(APPROVAL_SKEW_MS);
  });

  it("admits an approval logged just after the session's whole-second timestamp", () => {
    // Real run: the consent page logged the approval at .307 s, Supabase stamped the exchange as :20 (truncated).
    const { from, to } = approvalWindow(new Date("2026-10-18T21:29:20Z"));
    const approvedAt = new Date("2026-10-18T21:29:20.307Z");
    expect(approvedAt >= from && approvedAt <= to).toBe(true);
  });

  it("needs an approval, and no disconnect after it", () => {
    const approvedAt = new Date("2026-10-18T11:59:40Z");
    expect(isApprovedSession({ approvedAt, revokedAt: null })).toBe(true);
    expect(isApprovedSession({ approvedAt: null, revokedAt: null })).toBe(false);
    expect(isApprovedSession({ approvedAt, revokedAt: new Date("2026-10-18T11:59:00Z") })).toBe(true);
    expect(isApprovedSession({ approvedAt, revokedAt: new Date("2026-10-19T08:00:00Z") })).toBe(false);
  });
});
