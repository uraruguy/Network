import { describe, expect, it } from "vitest";
import { classify, isLoginPage } from "./routes";

const ID = "3ae4df27-f2e0-42ce-a859-92f1dab46b2a";

describe("classify", () => {
  it.each([
    ["/login", "public"],
    ["/login/reset", "public"],
    ["/auth/callback", "public"],
    ["/manifest.webmanifest", "public"],
    ["/sw.js", "public"],
    ["/~offline", "public"],
    ["/robots.txt", "public"],
    ["/favicon.ico", "public"],
    ["/_next/static/chunks/app.js", "public"],
    ["/icons/icon-192.png", "public"],
    ["/data/countries-110m.json", "public"],
    ["/apple-touch-icon.png", "public"],
  ])("%s → %s", (path, expected) => expect(classify(path)).toBe(expected));

  it.each([
    ["/api/mcp", "machine"],
    ["/api/mcp/sse", "machine"],
    ["/api/inbox", "machine"],
    ["/api/cron/reminders", "machine"],
    ["/.well-known/oauth-protected-resource", "machine"],
    ["/r/abc", "machine"],
    [`/api/reminders/${ID}/done`, "machine"],
    [`/api/reminders/${ID}/snooze`, "machine"],
  ])("%s → %s", (path, expected) => expect(classify(path)).toBe(expected));

  it.each([
    ["/login/verify", "mfa-step"],
    ["/api/auth/webauthn/authenticate/options", "mfa-step"],
    ["/api/auth/webauthn", "mfa-step"],
    ["/api/auth/recovery", "mfa-step"],
  ])("%s → %s", (path, expected) => expect(classify(path)).toBe(expected));

  it("protects the app's own API and pages by default", () => {
    expect(classify("/api/people")).toBe("api");
    expect(classify(`/api/people/${ID}`)).toBe("api");
    expect(classify("/api/inbox/owner")).toBe("api"); // not the Shortcut endpoint
    expect(classify(`/api/inbox/owner/${ID}`)).toBe("api");
    expect(classify("/api/reminders")).toBe("api"); // the reminders API is NOT public
    expect(classify(`/api/reminders/${ID}`)).toBe("api");
    expect(classify(`/api/reminders/${ID}/delete`)).toBe("api");
    expect(classify("/api/reminders/not-a-uuid/done")).toBe("api");
    expect(classify("/api/auth/recovery/extra")).toBe("api");
    expect(classify("/api/cronjob")).toBe("api");
    expect(classify("/api/mcpx")).toBe("api");
    expect(classify("/api")).toBe("api");
    expect(classify("/today")).toBe("page");
    expect(classify("/")).toBe("page");
    expect(classify(`/people/${ID}`)).toBe("page");
    expect(classify("/oauth/consent")).toBe("page");
  });

  it("matches whole path segments only", () => {
    expect(classify("/loginx")).toBe("page");
    expect(classify("/login/verifyx")).toBe("public");
    expect(classify("/authz")).toBe("page");
    expect(classify("/rx")).toBe("page");
    expect(classify("/people/photo.png")).toBe("page"); // only root-level files are static
  });
});

describe("isLoginPage", () => {
  it("is true for the sign-in page but not the passkey step", () => {
    expect(isLoginPage("/login")).toBe(true);
    expect(isLoginPage("/login/reset")).toBe(true);
    expect(isLoginPage("/login/verify")).toBe(false);
    expect(isLoginPage("/today")).toBe(false);
  });
});
