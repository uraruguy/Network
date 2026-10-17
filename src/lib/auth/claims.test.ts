import { describe, expect, it } from "vitest";
import { parseClaims, verifySession } from "./claims";

const base = {
  sub: "114287d9-de5c-4ff5-a9b5-25d0785552e7",
  session_id: "0b8c2f7e-6a51-4a4b-9d0e-3f1f0f6c1a11",
  role: "authenticated",
  aal: "aal1",
  email: "dev@local.test",
  is_anonymous: false,
};

describe("parseClaims", () => {
  it("accepts a normal web session", () => {
    expect(parseClaims(base)).toEqual({ sub: base.sub, sessionId: base.session_id, aal: "aal1", email: base.email, clientId: null });
    expect(parseClaims({ ...base, aal: "aal2" })?.aal).toBe("aal2");
  });

  it("rejects OAuth client tokens as web sessions", () => {
    expect(parseClaims({ ...base, client_id: "mcp-client" })).toBeNull();
    expect(parseClaims({ ...base, client_id: "mcp-client" }, { allowOAuthClient: true })?.clientId).toBe("mcp-client");
  });

  it("rejects incomplete or foreign tokens", () => {
    expect(parseClaims(null)).toBeNull();
    expect(parseClaims("token")).toBeNull();
    expect(parseClaims({ ...base, sub: "" })).toBeNull();
    expect(parseClaims({ ...base, session_id: undefined })).toBeNull();
    expect(parseClaims({ ...base, role: "anon" })).toBeNull();
    expect(parseClaims({ ...base, role: "service_role" })).toBeNull();
    expect(parseClaims({ ...base, is_anonymous: true })).toBeNull();
  });
});

describe("verifySession", () => {
  const client = (result: unknown) => ({ auth: { getClaims: async () => result } }) as never;

  it("returns parsed claims", async () => {
    expect((await verifySession(client({ data: { claims: base }, error: null })))?.sub).toBe(base.sub);
  });

  it("returns null on errors, missing sessions and thrown exceptions", async () => {
    expect(await verifySession(client({ data: null, error: new Error("expired") }))).toBeNull();
    expect(await verifySession(client({ data: null, error: null }))).toBeNull();
    const throwing = { auth: { getClaims: async () => { throw new Error("offline"); } } } as never;
    expect(await verifySession(throwing)).toBeNull();
  });
});
