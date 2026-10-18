import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Owner } from "@/lib/auth/server";

/**
 * Guards of the passkey endpoints, with storage and the WebAuthn library mocked out: who may
 * enroll, when the passkey cookie is (and is never) set, CSRF/origin checks, rate limits.
 */

type Cookie = { value: string; options?: { maxAge?: number } };
const jar = new Map<string, Cookie>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: { maxAge?: number }) => void jar.set(name, { value, options }),
  }),
}));

let owner: Owner | null = null;
vi.mock("@/lib/auth/server", () => ({ getOwner: async () => owner }));

const passkeys = {
  countCredentials: vi.fn(async () => 0),
  generateRecoveryCodes: vi.fn(async () => ["AAAA-BBBB-CCCC", "DDDD-EEEE-FFFF"]),
  consumeRecoveryCode: vi.fn(async () => false),
  countUnusedRecoveryCodes: vi.fn(async () => 9),
};
vi.mock("@/lib/data/passkeys", () => passkeys);

const ceremonies = {
  registrationOptions: vi.fn(async () => ({ options: { challenge: "reg-challenge" }, challengeCookie: "register.cookie" })),
  verifyRegistration: vi.fn(async (): Promise<unknown> => ({ ok: true, credential: { id: "cred-1", name: "iPhone" } })),
  authenticationOptions: vi.fn(async () => ({ options: { challenge: "auth-challenge" }, challengeCookie: "authenticate.cookie", credentialCount: 1 })),
  verifyAuthentication: vi.fn(async (): Promise<unknown> => ({ ok: true, credentialId: "cred-1" })),
};
vi.mock("@/lib/auth/webauthn", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth/webauthn")>()), ...ceremonies }));

const notify = vi.fn();
vi.mock("./notify", () => ({ notifySecurityEvent: (...args: unknown[]) => notify(...args) }));

const MFA = "__Host-network-mfa";
const CHALLENGE = "__Host-network-webauthn";
const ORIGIN = "http://localhost:3100";

const credential = { id: "cred-1", rawId: "cred-1", type: "public-key", response: { clientDataJSON: "x" }, clientExtensionResults: {} };

function post(path: string, body?: unknown, origin: string | null = ORIGIN) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  return new Request(`${ORIGIN}${path}`, { method: "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function signedIn(opts: Partial<Owner> = {}): Owner {
  return {
    id: "114287d9-de5c-4ff5-a9b5-25d0785552e7",
    claims: { sub: "114287d9-de5c-4ff5-a9b5-25d0785552e7", sessionId: "0b8c2f7e-6a51-4a4b-9d0e-3f1f0f6c1a11", aal: "aal1", email: "dev@local.test", clientId: null, emailProofAt: null },
    mfaSatisfied: false,
    mfaVerified: false,
    ...opts,
  };
}

beforeEach(() => {
  jar.clear();
  owner = signedIn();
  vi.clearAllMocks();
  passkeys.countCredentials.mockResolvedValue(0);
});

describe("POST /api/auth/webauthn/register/options", async () => {
  const { POST } = await import("../webauthn/register/options/route");

  it("lets a password session enroll the first passkey (bootstrap)", async () => {
    const res = await POST(post("/api/auth/webauthn/register/options"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ challenge: "reg-challenge" });
    expect(jar.get(CHALLENGE)?.value).toBe("register.cookie");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("requires a passkey-verified session once a passkey exists", async () => {
    passkeys.countCredentials.mockResolvedValue(1);
    const res = await POST(post("/api/auth/webauthn/register/options"));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("verification_required");
    expect(ceremonies.registrationOptions).not.toHaveBeenCalled();

    owner = signedIn({ mfaVerified: true, mfaSatisfied: true });
    expect((await POST(post("/api/auth/webauthn/register/options"))).status).toBe(200);
  });

  it("rejects signed-out and cross-origin callers", async () => {
    expect((await POST(post("/api/auth/webauthn/register/options", undefined, "https://evil.example"))).status).toBe(403);
    expect((await POST(post("/api/auth/webauthn/register/options", undefined, null))).status).toBe(403);
    owner = null;
    const res = await POST(post("/api/auth/webauthn/register/options"));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthenticated");
  });
});

describe("POST /api/auth/webauthn/register/verify", async () => {
  const { POST } = await import("../webauthn/register/verify/route");

  it("stores the first passkey, returns recovery codes once and verifies the session", async () => {
    jar.set(CHALLENGE, { value: "register.cookie" });
    const res = await POST(post("/api/auth/webauthn/register/verify", { response: credential, name: "iPhone" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recoveryCodes).toHaveLength(2);
    expect(ceremonies.verifyRegistration).toHaveBeenCalledWith(expect.objectContaining({ challengeCookie: "register.cookie", name: "iPhone" }));
    expect(jar.get(MFA)?.value).toMatch(/^v1\.\d+\./);
    expect(jar.get(CHALLENGE)?.options?.maxAge).toBe(0); // single use
    expect(notify).toHaveBeenCalledWith("dev@local.test", { kind: "passkey_added", name: "iPhone" }, null);
  });

  it("does not hand out new codes for additional passkeys", async () => {
    passkeys.countCredentials.mockResolvedValue(1);
    owner = signedIn({ mfaVerified: true, mfaSatisfied: true });
    const body = await (await POST(post("/api/auth/webauthn/register/verify", { response: credential }))).json();
    expect(body.recoveryCodes).toBeUndefined();
    expect(passkeys.generateRecoveryCodes).not.toHaveBeenCalled();
  });

  it("never sets the passkey cookie when verification fails", async () => {
    ceremonies.verifyRegistration.mockResolvedValueOnce({ ok: false, reason: "challenge" });
    const res = await POST(post("/api/auth/webauthn/register/verify", { response: credential }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("challenge_expired");
    expect(jar.has(MFA)).toBe(false);
  });

  it("refuses an unverified session adding a second passkey, and malformed bodies", async () => {
    passkeys.countCredentials.mockResolvedValue(2);
    expect((await POST(post("/api/auth/webauthn/register/verify", { response: credential }))).status).toBe(403);
    passkeys.countCredentials.mockResolvedValue(0);
    expect((await POST(post("/api/auth/webauthn/register/verify", { response: { id: "x" } }))).status).toBe(422);
    expect(ceremonies.verifyRegistration).not.toHaveBeenCalled();
  });
});

describe("passkey authentication", async () => {
  const options = (await import("../webauthn/authenticate/options/route")).POST;
  const verify = (await import("../webauthn/authenticate/verify/route")).POST;

  it("issues a challenge only when passkeys exist", async () => {
    expect((await options(post("/api/auth/webauthn/authenticate/options"))).status).toBe(200);
    expect(jar.get(CHALLENGE)?.value).toBe("authenticate.cookie");
    ceremonies.authenticationOptions.mockResolvedValueOnce({ options: { challenge: "x" }, challengeCookie: "c", credentialCount: 0 });
    expect((await options(post("/api/auth/webauthn/authenticate/options"))).status).toBe(409);
  });

  it("sets the passkey cookie after a valid assertion only", async () => {
    ceremonies.verifyAuthentication.mockResolvedValueOnce({ ok: false, reason: "verification" });
    const bad = await verify(post("/api/auth/webauthn/authenticate/verify", { response: credential }));
    expect(bad.status).toBe(400);
    expect(jar.has(MFA)).toBe(false);

    const good = await verify(post("/api/auth/webauthn/authenticate/verify", { response: credential }));
    expect(good.status).toBe(200);
    expect(jar.get(MFA)?.value).toMatch(/^v1\./);
  });
});

describe("POST /api/auth/recovery", async () => {
  const { POST } = await import("../recovery/route");

  it("verifies the session with a valid one-time code", async () => {
    passkeys.consumeRecoveryCode.mockResolvedValueOnce(true);
    owner = signedIn({ id: "a1b2c3d4-0000-4000-8000-000000000001" });
    const res = await POST(post("/api/auth/recovery", { code: "aaaa-bbbb-cccc" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, remaining: 9 });
    expect(jar.get(MFA)?.value).toMatch(/^v1\./);
    expect(notify).toHaveBeenCalledWith("dev@local.test", { kind: "recovery_code_used", remaining: 9 }, null);
  });

  it("rejects wrong codes and rate-limits guessing per account", async () => {
    owner = signedIn({ id: "a1b2c3d4-0000-4000-8000-000000000002" });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await POST(post("/api/auth/recovery", { code: "WRONG-CODE-XXXX" }))).status);
    expect(statuses).toEqual([400, 400, 400, 400, 400, 429]);
    expect(jar.has(MFA)).toBe(false);
  });
});

describe("POST /api/auth/logout", async () => {
  const { POST } = await import("../logout/route");

  it("clears the passkey cookie, even without a session", async () => {
    owner = null;
    jar.set(MFA, { value: "v1.1.x" });
    const res = await POST(post("/api/auth/logout"));
    expect(res.status).toBe(200);
    expect(jar.get(MFA)).toMatchObject({ value: "", options: { maxAge: 0 } });
  });

  it("refuses cross-site requests", async () => {
    expect((await POST(post("/api/auth/logout", undefined, "https://evil.example"))).status).toBe(403);
  });
});
