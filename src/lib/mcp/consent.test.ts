import { describe, expect, it } from "vitest";
import { consentPolicy, isLocalHost, redirectHost, redirectProblem } from "./consent";

describe("redirectProblem", () => {
  it("lets codes go to public https hosts (hosted connectors)", () => {
    expect(redirectProblem("https://claude.ai/api/mcp/auth_callback")).toBeNull();
    expect(redirectProblem("https://chatgpt.com/connector_platform_oauth_redirect")).toBeNull();
    expect(redirectProblem("https://93.184.216.34/callback")).toBeNull();
  });

  it("turns away apps on the owner's computer or network", () => {
    for (const uri of [
      "http://localhost:6274/oauth/callback",
      "http://127.0.0.1:33418/callback",
      "https://127.1/callback", // normalised to 127.0.0.1
      "http://2130706433/cb", // 127.0.0.1 as a number
      "http://[::1]:8080/cb",
      "https://[::ffff:127.0.0.1]/cb",
      "https://app.localhost/cb",
      "https://printer.local/cb",
      "https://10.0.0.5/cb",
      "https://172.20.1.1/cb",
      "https://192.168.1.10/cb",
      "https://169.254.169.254/latest",
      "https://100.100.1.1/cb", // CGNAT / Tailscale
      "https://[fd12:3456::1]/cb",
      "https://[fe80::1]/cb",
      "https://intranet/cb",
      "https://nas.home.arpa/cb",
      "cursor://anysphere.cursor-retrieval/oauth/callback",
      "com.example.app:/oauth2redirect",
    ]) {
      expect(redirectProblem(uri), uri).toBe("local");
    }
  });

  it("refuses plain http to public hosts and garbage", () => {
    expect(redirectProblem("http://example.com/cb")).toBe("insecure");
    expect(redirectProblem("not a url")).toBe("invalid");
  });

  it("admits loopback only when allowed (the app itself runs on localhost)", () => {
    expect(redirectProblem("http://localhost:6274/oauth/callback", { allowLoopback: true })).toBeNull();
    expect(redirectProblem("http://127.0.0.1:9000/cb", { allowLoopback: true })).toBeNull();
    expect(redirectProblem("http://[::1]:9000/cb", { allowLoopback: true })).toBeNull();
    expect(redirectProblem("https://192.168.1.10/cb", { allowLoopback: true })).toBe("local");
  });
});

describe("helpers", () => {
  it("derives the policy from the app URL", () => {
    expect(consentPolicy("http://localhost:3100")).toEqual({ allowLoopback: true });
    expect(consentPolicy("https://network.example.com")).toEqual({ allowLoopback: false });
    expect(consentPolicy("nonsense")).toEqual({ allowLoopback: false });
  });

  it("classifies hosts", () => {
    expect(isLocalHost("claude.ai")).toBe(false);
    expect(isLocalHost("172.32.0.1")).toBe(false);
    expect(isLocalHost("localhost.")).toBe(true);
  });

  it("shows hosts", () => {
    expect(redirectHost("https://claude.ai/api/mcp/auth_callback?x=1")).toBe("claude.ai");
    expect(redirectHost("http://localhost:6274/cb")).toBe("localhost:6274");
    expect(redirectHost("cursor://anysphere.cursor-retrieval/cb")).toBe("anysphere.cursor-retrieval");
    expect(redirectHost("bad")).toBe("bad");
  });
});
