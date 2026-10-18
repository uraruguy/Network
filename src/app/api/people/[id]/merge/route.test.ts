import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Owner } from "@/lib/auth/server";
import { HttpError } from "@/lib/errors";

/** POST/GET /api/people/[id]/merge with the data layer mocked: direction, dry run vs write, audit, errors. */

const OWNER = "114287d9-de5c-4ff5-a9b5-25d0785552e7";
const DROP = "22222222-2222-4222-8222-222222222222";
const KEEP = "11111111-1111-4111-8111-111111111111";

let owner: Owner | null = null;
vi.mock("@/lib/auth/server", () => ({ getOwner: async () => owner }));
vi.mock("@/lib/db", () => ({ db: { tag: "db" } }));

const report = (dryRun: boolean) => ({ keep: { id: KEEP, name: "Vid" }, drop: { id: DROP, name: "Vid" }, fields: ["company"], moved: { notes: 2 }, factsMerged: false, dryRun });
const merge = vi.hoisted(() => ({ mergePeople: vi.fn() }));
vi.mock("@/lib/data/people-merge", () => merge);
const people = vi.hoisted(() => ({ getPerson: vi.fn() }));
vi.mock("@/lib/data/people", () => people);
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/data/audit", () => audit);

const { GET, POST } = await import("./route");

const ctx = (id = DROP) => ({ params: Promise.resolve({ id }) });
const url = (q = `into=${KEEP}`) => `http://localhost:3100/api/people/${DROP}/merge?${q}`;
const post = (body: unknown) => new Request(url(""), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  owner = { id: OWNER, claims: {} as Owner["claims"], mfaSatisfied: true, mfaVerified: true };
  merge.mergePeople.mockImplementation(async (_db, _owner, _keep, _drop, { write }) => report(!write));
  people.getPerson.mockResolvedValue({ id: KEEP, displayName: "Vid" });
  audit.recordAudit.mockResolvedValue(undefined);
});

describe("GET (preview)", () => {
  it("dry-runs merging [id] into ?into=", async () => {
    const res = await GET(new Request(url()), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(report(true));
    expect(merge.mergePeople).toHaveBeenCalledWith({ tag: "db" }, OWNER, KEEP, DROP, { write: false });
    expect(audit.recordAudit).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects a missing or malformed target", async () => {
    expect((await GET(new Request(url("into=nope")), ctx())).status).toBe(400);
    expect((await GET(new Request(url("")), ctx())).status).toBe(400);
    expect(merge.mergePeople).not.toHaveBeenCalled();
  });
});

describe("POST (merge)", () => {
  it("merges, records person.merge and returns the kept person with the report", async () => {
    const res = await POST(post({ into: KEEP }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ person: { id: KEEP, displayName: "Vid" }, report: report(false) });
    expect(merge.mergePeople).toHaveBeenCalledWith({ tag: "db" }, OWNER, KEEP, DROP, { write: true });
    expect(people.getPerson).toHaveBeenCalledWith(OWNER, KEEP);
    expect(audit.recordAudit).toHaveBeenCalledWith({
      ownerId: OWNER,
      actor: "user",
      action: "person.merge",
      entity: "person",
      entityId: KEEP,
      meta: { drop: { id: DROP, name: "Vid" }, fields: ["company"], moved: { notes: 2 } },
    });
  });

  it("keeps a done merge successful when the audit insert fails", async () => {
    audit.recordAudit.mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(post({ into: KEEP }), ctx())).status).toBe(200);
    spy.mockRestore();
  });

  it("passes the data layer's refusals through (same person, gone)", async () => {
    merge.mergePeople.mockRejectedValueOnce(new HttpError(422, "Pick two different people"));
    const res = await POST(post({ into: DROP }), ctx());
    expect([res.status, (await res.json()).message]).toEqual([422, "Pick two different people"]);
    merge.mergePeople.mockRejectedValueOnce(new HttpError(404, "Both people must exist and not be deleted"));
    expect((await POST(post({ into: KEEP }), ctx())).status).toBe(404);
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it("validates the body and the route id, and requires the full session", async () => {
    expect((await POST(post({ into: "x" }), ctx())).status).toBe(422);
    expect((await POST(post({ into: KEEP }), ctx("not-a-uuid"))).status).toBe(404);
    owner = { ...owner!, mfaSatisfied: false };
    expect((await POST(post({ into: KEEP }), ctx())).status).toBe(401);
    expect(merge.mergePeople).not.toHaveBeenCalled();
  });
});
