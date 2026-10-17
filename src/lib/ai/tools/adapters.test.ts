import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const audit = vi.hoisted(() => ({ recordAudit: vi.fn(async () => {}), countActions: vi.fn(async () => 0) }));
vi.mock("@/lib/data/audit", () => audit);
const tags = vi.hoisted(() => ({
  listTaxonomy: vi.fn(async () => ({
    categories: [{ id: "c1", name: "Mentor", count: 3 }],
    activities: [{ id: "a1", name: "Hiking", emoji: "🥾", count: 2 }],
    tags: [{ id: "t1", name: "climber", count: 1 }],
  })),
}));
vi.mock("@/lib/data/tags", () => tags);

import { OPS, registerMcpTools, toAiSdkTools, toCallToolResult, type ToolCtx } from "./index";

const ctx = (scopes: ToolCtx["scopes"]): ToolCtx => ({
  ownerId: "114287d9-de5c-4ff5-a9b5-25d0785552e7",
  scopes,
  actor: { via: "mcp", client: "Test", credential: "pat:t" },
  timezone: "Europe/Ljubljana",
});

const EXPECTED = [
  "search_people",
  "get_person",
  "list_notes",
  "recent_interactions",
  "search_notes",
  "people_by_place",
  "due_followups",
  "list_taxonomy",
  "add_note",
  "create_person",
  "update_person",
  "create_followup",
  "complete_followup",
];

beforeEach(() => vi.clearAllMocks());

describe("operation catalogue", () => {
  it("has the documented tools and no delete tools", () => {
    expect(OPS.map((o) => o.name)).toEqual(EXPECTED);
    expect(OPS.some((o) => /delete|remove/i.test(o.name))).toBe(false);
  });

  it("gives every tool a title, a real description and a JSON-schema-able input", () => {
    for (const op of OPS) {
      expect(op.title.length, op.name).toBeGreaterThan(3);
      expect(op.description.length, op.name).toBeGreaterThan(40);
      const schema = z.toJSONSchema(op.input) as { type: string };
      expect(schema.type, op.name).toBe("object");
    }
  });

  it("asks for Slovenian/English variants in note search", () => {
    expect(OPS.find((o) => o.name === "search_notes")!.description).toMatch(/Slovenian/);
  });
});

describe("toAiSdkTools", () => {
  it("includes write tools only for write-scoped contexts", () => {
    expect(Object.keys(toAiSdkTools(ctx(["network:read"])))).toEqual(EXPECTED.slice(0, 8));
    expect(Object.keys(toAiSdkTools(ctx(["network:read", "network:write"])))).toEqual(EXPECTED);
  });

  it("executes through the registry and returns data", async () => {
    const tools = toAiSdkTools(ctx(["network:read"]));
    const out = await tools.list_taxonomy!.execute!({}, { toolCallId: "1", messages: [] } as never);
    expect(out).toMatchObject({ categories: [{ name: "Mentor", people: 3 }], activities: [{ name: "Hiking", emoji: "🥾", people: 2 }] });
  });

  it("returns failures as { error, hint } values the model can read", async () => {
    const tools = toAiSdkTools(ctx(["network:read"]), { includeWrites: true });
    const out = await tools.add_note!.execute!({ personName: "Ana", text: "hi" }, { toolCallId: "1", messages: [] } as never);
    expect(out).toMatchObject({ error: expect.stringMatching(/read-only/), hint: expect.any(String) });
  });
});

describe("MCP adapter", () => {
  type Registered = { name: string; config: { annotations: Record<string, boolean>; inputSchema: unknown; title: string }; cb: (input: unknown, extra: unknown) => Promise<unknown> };
  const fakeServer = () => {
    const tools: Registered[] = [];
    return { tools, server: { registerTool: (name: string, config: Registered["config"], cb: Registered["cb"]) => tools.push({ name, config, cb }) } };
  };

  it("registers every tool with read-only hints", () => {
    const { tools, server } = fakeServer();
    registerMcpTools(server as never, ctx(["network:read"]));
    expect(tools.map((t) => t.name)).toEqual(EXPECTED);
    expect(tools.find((t) => t.name === "search_notes")!.config.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(tools.find((t) => t.name === "add_note")!.config.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
  });

  it("returns structuredContent plus the same JSON as text", async () => {
    const { tools, server } = fakeServer();
    registerMcpTools(server as never, () => ctx(["network:read"]));
    const res = (await tools.find((t) => t.name === "list_taxonomy")!.cb({}, {})) as { content: { type: string; text: string }[]; structuredContent: unknown };
    expect(res.structuredContent).toMatchObject({ categories: [{ name: "Mentor" }] });
    expect(JSON.parse(res.content[0]!.text)).toEqual(res.structuredContent);
  });

  it("rejects writes from read-only connections as tool errors", async () => {
    const { tools, server } = fakeServer();
    registerMcpTools(server as never, ctx(["network:read"]));
    const res = (await tools.find((t) => t.name === "add_note")!.cb({ personName: "Ana", text: "x" }, {})) as { isError: boolean; content: { text: string }[] };
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(/read-only/);
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it("wraps non-object results", () => {
    expect(toCallToolResult({ ok: true, data: [1, 2] })).toMatchObject({ structuredContent: { result: [1, 2] } });
  });
});
