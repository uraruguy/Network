import { beforeEach, describe, expect, it, vi } from "vitest";

const tokens = vi.hoisted(() => ({ findTokenRecord: vi.fn(), touchToken: vi.fn(async () => {}) }));
const grants = vi.hoisted(() => ({ findGrantRecord: vi.fn(), touchGrant: vi.fn(async () => {}) }));
const supa = vi.hoisted(() => ({ getClaims: vi.fn() }));
const log = vi.hoisted(() => ({ approvalEvidence: vi.fn() }));
vi.mock("@/lib/data/api-tokens", () => tokens);
vi.mock("@/lib/data/oauth-grants", () => grants);
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getClaims: supa.getClaims } }) }));
vi.mock("./approval-log", () => log);
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

import { forgetGrant, toolCtxFromAuth, verifyToken } from "./auth";
import { generateToken } from "./tokens";

const OWNER = "114287d9-de5c-4ff5-a9b5-25d0785552e7";
const req = new Request("http://localhost/api/mcp", { method: "POST" });

const tokenRow = (over: Record<string, unknown> = {}) => ({
  id: "3f1c2b4a-0000-4000-8000-000000000001",
  ownerId: OWNER,
  name: "Claude Code",
  scopes: ["network:read"],
  expiresAt: null,
  revokedAt: null,
  lastUsedAt: null,
  timezone: "Europe/Ljubljana",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("verifyToken — personal access tokens", () => {
  it("accepts an active token with the row's scopes and identifies the caller", async () => {
    tokens.findTokenRecord.mockResolvedValue(tokenRow({ scopes: ["network:write"] }));
    const t = generateToken();
    const info = await verifyToken(req, t);
    expect(info?.scopes).toEqual(["network:read", "network:write"]);
    expect(info?.clientId).toBe("pat:3f1c2b4a-0000-4000-8000-000000000001");
    expect(toolCtxFromAuth(info)).toEqual({
      ownerId: OWNER,
      scopes: ["network:read", "network:write"],
      actor: { via: "mcp", client: "Claude Code", credential: "pat:3f1c2b4a-0000-4000-8000-000000000001" },
      timezone: "Europe/Ljubljana",
    });
    expect(tokens.touchToken).toHaveBeenCalledOnce();
  });

  it("rejects revoked and expired tokens", async () => {
    tokens.findTokenRecord.mockResolvedValueOnce(tokenRow({ revokedAt: new Date() }));
    expect(await verifyToken(req, generateToken())).toBeUndefined();
    tokens.findTokenRecord.mockResolvedValueOnce(tokenRow({ expiresAt: new Date(Date.now() - 1000) }));
    expect(await verifyToken(req, generateToken())).toBeUndefined();
    tokens.findTokenRecord.mockResolvedValueOnce(null);
    expect(await verifyToken(req, generateToken())).toBeUndefined();
  });

  it("rejects malformed tokens without touching the database", async () => {
    expect(await verifyToken(req, "ntk_short")).toBeUndefined();
    expect(await verifyToken(req, undefined)).toBeUndefined();
    expect(tokens.findTokenRecord).not.toHaveBeenCalled();
  });

  it("rejects tokens whose scopes are all unknown", async () => {
    tokens.findTokenRecord.mockResolvedValue(tokenRow({ scopes: ["admin"] }));
    expect(await verifyToken(req, generateToken())).toBeUndefined();
  });

  it("writes last_used_at at most every 5 minutes", async () => {
    tokens.findTokenRecord.mockResolvedValue(tokenRow({ id: "3f1c2b4a-0000-4000-8000-000000000009", lastUsedAt: new Date(Date.now() - 60_000) }));
    await verifyToken(req, generateToken());
    expect(tokens.touchToken).not.toHaveBeenCalled();
  });
});

describe("verifyToken — OAuth access tokens", () => {
  const EXCHANGED = 1_792_000_000; // unix seconds of the code exchange
  /** Raw JWT claims as Supabase issues them to an OAuth client. */
  const jwt = (clientId: string | null, over: Record<string, unknown> = {}) => ({
    data: {
      claims: {
        sub: OWNER,
        role: "authenticated",
        session_id: `session-${clientId}`,
        aal: "aal1",
        ...(clientId ? { client_id: clientId } : {}),
        amr: [{ method: "oauth_provider/authorization_code", timestamp: EXCHANGED }],
        ...over,
      },
    },
    error: null,
  });
  const grant = (clientId: string, over: Record<string, unknown> = {}) => ({ clientId, clientName: "Claude", scopes: ["network:read"], revokedAt: null, timezone: "UTC", ...over });
  const approved = { approvedAt: new Date((EXCHANGED - 20) * 1000), revokedAt: null };

  beforeEach(() => log.approvalEvidence.mockResolvedValue(approved));

  it("rejects browser-session JWTs (no client_id)", async () => {
    supa.getClaims.mockResolvedValue(jwt(null));
    expect(await verifyToken(req, "eyJ.session.jwt")).toBeUndefined();
    expect(grants.findGrantRecord).not.toHaveBeenCalled();
  });

  it("rejects tokens that fail verification", async () => {
    supa.getClaims.mockResolvedValue({ data: null, error: new Error("bad signature") });
    expect(await verifyToken(req, "eyJ.bad")).toBeUndefined();
    supa.getClaims.mockRejectedValue(new Error("JWKS unreachable"));
    expect(await verifyToken(req, "eyJ.bad")).toBeUndefined();
  });

  it("takes scopes from the owner's grant, not from the token", async () => {
    supa.getClaims.mockResolvedValue(jwt("client-a", { scope: "network:write" }));
    grants.findGrantRecord.mockResolvedValue(grant("client-a"));
    const info = await verifyToken(req, "eyJ.oauth.a");
    expect(info?.scopes).toEqual(["network:read"]);
    expect(grants.findGrantRecord).toHaveBeenCalledWith(OWNER, "client-a");
    expect(log.approvalEvidence).toHaveBeenCalledWith(OWNER, "client-a", new Date(EXCHANGED * 1000));
    expect(toolCtxFromAuth(info).actor).toEqual({ via: "mcp", client: "Claude", credential: "oauth:client-a" });
  });

  it("rejects clients without a grant or with a revoked one", async () => {
    supa.getClaims.mockResolvedValue(jwt("client-b"));
    grants.findGrantRecord.mockResolvedValueOnce(null);
    expect(await verifyToken(req, "eyJ.oauth.b")).toBeUndefined();

    supa.getClaims.mockResolvedValue(jwt("client-c"));
    grants.findGrantRecord.mockResolvedValueOnce(grant("client-c", { scopes: ["network:write"], revokedAt: new Date(), timezone: null }));
    expect(await verifyToken(req, "eyJ.oauth.c")).toBeUndefined();
  });

  it("refuses sessions minted without a passkey-verified approval (password-only Supabase session)", async () => {
    supa.getClaims.mockResolvedValue(jwt("client-e"));
    grants.findGrantRecord.mockResolvedValue(grant("client-e"));
    log.approvalEvidence.mockResolvedValueOnce({ approvedAt: null, revokedAt: null });
    expect(await verifyToken(req, "eyJ.oauth.e")).toBeUndefined();
  });

  it("refuses sessions minted before a disconnect, even after the app was approved again", async () => {
    supa.getClaims.mockResolvedValue(jwt("client-f"));
    grants.findGrantRecord.mockResolvedValue(grant("client-f"));
    log.approvalEvidence.mockResolvedValueOnce({ approvedAt: approved.approvedAt, revokedAt: new Date((EXCHANGED + 3600) * 1000) });
    expect(await verifyToken(req, "eyJ.oauth.f")).toBeUndefined();
  });

  it("fails closed when the token doesn't say when its session was created", async () => {
    supa.getClaims.mockResolvedValue(jwt("client-g", { amr: [{ method: "password", timestamp: EXCHANGED }] }));
    grants.findGrantRecord.mockResolvedValue(grant("client-g"));
    expect(await verifyToken(req, "eyJ.oauth.g")).toBeUndefined();
    expect(log.approvalEvidence).not.toHaveBeenCalled();
  });

  it("accepts a real Supabase OAuth token and its refresh (claims from GoTrue v2.196, local run)", async () => {
    const issued = {
      iss: "http://127.0.0.1:54321/auth/v1",
      sub: OWNER,
      aud: "authenticated",
      exp: 1_792_362_560,
      iat: 1_792_358_960,
      email: "dev@local.test",
      phone: "",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { email_verified: true },
      role: "authenticated",
      aal: "aal1",
      amr: [{ method: "oauth_provider/authorization_code", timestamp: 1_792_358_960 }],
      session_id: "11607901-1ec8-47f4-a761-f9bf9346f250",
      is_anonymous: false,
      client_id: "6377643f-b46c-489d-8f3f-dbb098a3582e",
      scope: "email",
    };
    const refreshed = { ...issued, iat: 1_792_359_047, exp: 1_792_362_647 };
    grants.findGrantRecord.mockResolvedValue(grant(issued.client_id, { clientName: "MCP Inspector" }));
    log.approvalEvidence.mockResolvedValue({ approvedAt: new Date("2026-10-18T21:29:20.307Z"), revokedAt: null });
    for (const claims of [issued, refreshed]) {
      supa.getClaims.mockResolvedValueOnce({ data: { claims }, error: null });
      const info = await verifyToken(req, "eyJ.real");
      expect(info?.scopes).toEqual(["network:read"]); // the grant's, not the token's "email"
      expect(toolCtxFromAuth(info).actor.credential).toBe(`oauth:${issued.client_id}`);
    }
    // One lookup for the session: the refreshed token keeps session_id and the exchange time.
    expect(log.approvalEvidence).toHaveBeenCalledTimes(1);
    expect(log.approvalEvidence).toHaveBeenCalledWith(OWNER, issued.client_id, new Date("2026-10-18T21:29:20Z"));
  });

  it("falls back to UTC for a broken profile time zone", async () => {
    supa.getClaims.mockResolvedValue(jwt("client-h"));
    grants.findGrantRecord.mockResolvedValue(grant("client-h", { timezone: "Mars/Olympus_Mons" }));
    expect(toolCtxFromAuth(await verifyToken(req, "eyJ.oauth.h")).timezone).toBe("UTC");
  });

  it("caches grant and approval lookups briefly, and forgetGrant drops both", async () => {
    supa.getClaims.mockResolvedValue(jwt("client-d"));
    grants.findGrantRecord.mockResolvedValue(grant("client-d", { clientName: "Cursor", timezone: null }));
    await verifyToken(req, "eyJ.oauth.d");
    await verifyToken(req, "eyJ.oauth.d");
    expect(grants.findGrantRecord).toHaveBeenCalledTimes(1);
    expect(log.approvalEvidence).toHaveBeenCalledTimes(1);

    forgetGrant(OWNER, "client-d");
    grants.findGrantRecord.mockResolvedValue(grant("client-d", { clientName: "Cursor", revokedAt: new Date(), timezone: null }));
    expect(await verifyToken(req, "eyJ.oauth.d")).toBeUndefined();
    expect(grants.findGrantRecord).toHaveBeenCalledTimes(2);

    forgetGrant(OWNER, "client-d");
    grants.findGrantRecord.mockResolvedValue(grant("client-d", { clientName: "Cursor", timezone: null }));
    expect(await verifyToken(req, "eyJ.oauth.d")).toBeDefined();
    expect(log.approvalEvidence).toHaveBeenCalledTimes(2);
  });
});

describe("toolCtxFromAuth", () => {
  it("refuses requests without a verified caller", () => {
    expect(() => toolCtxFromAuth(undefined)).toThrow(/Not authenticated/);
    expect(() => toolCtxFromAuth({ token: "t", clientId: "c", scopes: [] })).toThrow();
  });
});
