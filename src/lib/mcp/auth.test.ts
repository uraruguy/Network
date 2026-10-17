import { beforeEach, describe, expect, it, vi } from "vitest";

const tokens = vi.hoisted(() => ({ findTokenRecord: vi.fn(), touchToken: vi.fn(async () => {}) }));
const grants = vi.hoisted(() => ({ findGrantRecord: vi.fn(), touchGrant: vi.fn(async () => {}) }));
const claims = vi.hoisted(() => ({ verifyBearer: vi.fn() }));
vi.mock("@/lib/data/api-tokens", () => tokens);
vi.mock("@/lib/data/oauth-grants", () => grants);
vi.mock("@/lib/auth/claims", () => claims);
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
  const sessionClaims = (clientId: string | null) => ({ sub: OWNER, sessionId: "s1", aal: "aal1", email: null, clientId });

  it("rejects browser-session JWTs (no client_id)", async () => {
    claims.verifyBearer.mockResolvedValue(sessionClaims(null));
    expect(await verifyToken(req, "eyJ.session.jwt")).toBeUndefined();
    expect(grants.findGrantRecord).not.toHaveBeenCalled();
  });

  it("rejects tokens that fail verification", async () => {
    claims.verifyBearer.mockResolvedValue(null);
    expect(await verifyToken(req, "eyJ.bad")).toBeUndefined();
  });

  it("takes scopes from the owner's grant, not from the token", async () => {
    claims.verifyBearer.mockResolvedValue(sessionClaims("client-a"));
    grants.findGrantRecord.mockResolvedValue({ clientId: "client-a", clientName: "Claude", scopes: ["network:read"], revokedAt: null, timezone: "UTC" });
    const info = await verifyToken(req, "eyJ.oauth.a");
    expect(info?.scopes).toEqual(["network:read"]);
    expect(grants.findGrantRecord).toHaveBeenCalledWith(OWNER, "client-a");
    expect(toolCtxFromAuth(info).actor).toEqual({ via: "mcp", client: "Claude", credential: "oauth:client-a" });
  });

  it("rejects clients without a grant or with a revoked one", async () => {
    claims.verifyBearer.mockResolvedValue(sessionClaims("client-b"));
    grants.findGrantRecord.mockResolvedValueOnce(null);
    expect(await verifyToken(req, "eyJ.oauth.b")).toBeUndefined();

    claims.verifyBearer.mockResolvedValue(sessionClaims("client-c"));
    grants.findGrantRecord.mockResolvedValueOnce({ clientId: "client-c", clientName: "X", scopes: ["network:write"], revokedAt: new Date(), timezone: null });
    expect(await verifyToken(req, "eyJ.oauth.c")).toBeUndefined();
  });

  it("caches grant lookups briefly, and forgetGrant drops the cache", async () => {
    claims.verifyBearer.mockResolvedValue(sessionClaims("client-d"));
    grants.findGrantRecord.mockResolvedValue({ clientId: "client-d", clientName: "Cursor", scopes: ["network:read"], revokedAt: null, timezone: null });
    await verifyToken(req, "eyJ.oauth.d");
    await verifyToken(req, "eyJ.oauth.d");
    expect(grants.findGrantRecord).toHaveBeenCalledTimes(1);

    forgetGrant(OWNER, "client-d");
    grants.findGrantRecord.mockResolvedValue({ clientId: "client-d", clientName: "Cursor", scopes: ["network:read"], revokedAt: new Date(), timezone: null });
    expect(await verifyToken(req, "eyJ.oauth.d")).toBeUndefined();
    expect(grants.findGrantRecord).toHaveBeenCalledTimes(2);
  });
});

describe("toolCtxFromAuth", () => {
  it("refuses requests without a verified caller", () => {
    expect(() => toolCtxFromAuth(undefined)).toThrow(/Not authenticated/);
    expect(() => toolCtxFromAuth({ token: "t", clientId: "c", scopes: [] })).toThrow();
  });
});
