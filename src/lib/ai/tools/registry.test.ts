import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const audit = vi.hoisted(() => ({ recordAudit: vi.fn(async () => {}), countActions: vi.fn(async () => 0) }));
vi.mock("@/lib/data/audit", () => audit);

import { HttpError } from "@/lib/errors";
import { auditActor, defineOp, MCP_WRITES_PER_HOUR, runOp, sourceOf, ToolError, type ToolCtx } from "./registry";

const OWNER = "114287d9-de5c-4ff5-a9b5-25d0785552e7";
const ctx = (over: Partial<ToolCtx> = {}): ToolCtx => ({
  ownerId: OWNER,
  scopes: ["network:read"],
  actor: { via: "mcp", client: "Cursor", credential: "pat:abc" },
  timezone: "Europe/Ljubljana",
  ...over,
});

const readOp = defineOp({
  name: "echo",
  title: "Echo",
  description: "test",
  access: "read",
  input: z.object({ text: z.string().min(1), times: z.number().int().max(3).default(1) }),
  run: async (_ctx, input) => ({ out: input.text.repeat(input.times) }),
});

const run = vi.fn(async (_ctx: ToolCtx, input: { text: string }) => ({ id: "n1", text: input.text }));
const writeOp = defineOp({
  name: "write_thing",
  title: "Write thing",
  description: "test",
  access: "write",
  input: z.object({ text: z.string() }),
  run,
  audit: (r) => ({ entity: "note", entityId: r.id }),
});

beforeEach(() => {
  vi.clearAllMocks();
  audit.countActions.mockResolvedValue(0);
});

describe("runOp — validation", () => {
  it("parses input and applies defaults", async () => {
    expect(await runOp(readOp, ctx(), { text: "ab" })).toEqual({ ok: true, data: { out: "ab" } });
    expect(await runOp(readOp, ctx(), { text: "ab", times: 2 })).toEqual({ ok: true, data: { out: "abab" } });
  });

  it("rejects invalid input with the offending path", async () => {
    const r = await runOp(readOp, ctx(), { text: "", times: 9 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("invalid_input");
    expect(r.error.message).toMatch(/text/);
    expect(r.error.message).toMatch(/times/);
  });

  it("treats a missing argument object as {}", async () => {
    const r = await runOp(readOp, ctx(), undefined);
    expect(r.ok).toBe(false);
  });
});

describe("runOp — scopes", () => {
  it("lets read-scoped callers read but never write", async () => {
    expect((await runOp(readOp, ctx(), { text: "x" })).ok).toBe(true);
    const r = await runOp(writeOp, ctx(), { text: "x" });
    expect(r).toMatchObject({ ok: false, error: { code: "forbidden" } });
    if (!r.ok) expect(r.error.hint).toMatch(/Read & write/);
    expect(run).not.toHaveBeenCalled();
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it("lets write-scoped callers read and write", async () => {
    const c = ctx({ scopes: ["network:write"] });
    expect((await runOp(readOp, c, { text: "x" })).ok).toBe(true);
    expect((await runOp(writeOp, c, { text: "x" })).ok).toBe(true);
  });

  it("rejects callers without any scope", async () => {
    expect(await runOp(readOp, ctx({ scopes: [] }), { text: "x" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });
});

describe("runOp — writes", () => {
  const writer = ctx({ scopes: ["network:read", "network:write"] });

  it("audits successful writes with actor, entity and client", async () => {
    await runOp(writeOp, writer, { text: "hello" });
    expect(audit.recordAudit).toHaveBeenCalledWith({
      ownerId: OWNER,
      actor: "mcp:pat:abc",
      action: "tool.write_thing",
      entity: "note",
      entityId: "n1",
      meta: { via: "mcp", client: "Cursor" },
    });
  });

  it("does not audit reads", async () => {
    await runOp(readOp, writer, { text: "x" });
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it("rate-limits MCP writes per credential", async () => {
    audit.countActions.mockResolvedValue(MCP_WRITES_PER_HOUR);
    const r = await runOp(writeOp, writer, { text: "x" });
    expect(r).toMatchObject({ ok: false, error: { code: "rate_limited" } });
    expect(audit.countActions).toHaveBeenCalledWith(OWNER, "mcp:pat:abc", expect.objectContaining({ actionPrefix: "tool." }));
    expect(run).not.toHaveBeenCalled();
  });

  it("does not rate-limit the in-app assistant", async () => {
    audit.countActions.mockResolvedValue(10_000);
    const chat = ctx({ scopes: ["network:read", "network:write"], actor: { via: "chat", client: "assistant", credential: "assistant" } });
    expect((await runOp(writeOp, chat, { text: "x" })).ok).toBe(true);
    expect(audit.countActions).not.toHaveBeenCalled();
  });

  it("keeps a successful write successful when the audit insert fails", async () => {
    audit.recordAudit.mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await runOp(writeOp, writer, { text: "x" })).ok).toBe(true);
    spy.mockRestore();
  });
});

describe("runOp — errors", () => {
  const failing = (err: unknown) =>
    defineOp({ name: "boom", title: "Boom", description: "", access: "read", input: z.object({}), run: async () => Promise.reject(err) });

  it("passes ToolErrors through with their hint", async () => {
    const r = await runOp(failing(new ToolError("ambiguous", "Two Anas", "Ask which one")), ctx(), {});
    expect(r).toEqual({ ok: false, error: { code: "ambiguous", message: "Two Anas", hint: "Ask which one" } });
  });

  it("maps data-layer HttpErrors", async () => {
    expect(await runOp(failing(new HttpError(404, "Unknown person")), ctx(), {})).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await runOp(failing(new HttpError(409, "Conflict")), ctx(), {})).toMatchObject({ ok: false, error: { code: "invalid_input" } });
  });

  it("hides unexpected errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await runOp(failing(new Error("password=hunter2")), ctx(), {});
    expect(r).toMatchObject({ ok: false, error: { code: "failed" } });
    if (!r.ok) expect(r.error.message).not.toMatch(/hunter2/);
    spy.mockRestore();
  });
});

describe("helpers", () => {
  it("builds audit actors and provenance", () => {
    expect(auditActor({ via: "chat", client: "assistant", credential: "assistant" })).toBe("chat:assistant");
    expect(sourceOf(ctx())).toEqual({ kind: "mcp", ref: "Cursor" });
  });
});
