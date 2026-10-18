import "server-only";
import { tool, type ToolSet } from "ai";
import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import { READ_OPS } from "./read";
import { runOp, type OpDefinition, type OpInput, type OpResult, type ToolCtx } from "./registry";
import { WRITE_OPS } from "./write";

export { defineOp, runOp, ToolError, SCOPES, MCP_WRITES_PER_HOUR, canRead, canWrite, auditActor } from "./registry";
export type { Scope, ToolActor, ToolCtx, OpDefinition } from "./registry";

/** Every operation, reads first. Order is the order clients list them in. */
export const OPS: readonly OpDefinition<OpInput, unknown>[] = [...READ_OPS, ...WRITE_OPS] as unknown as OpDefinition<OpInput, unknown>[];

export type OpName = (typeof READ_OPS)[number]["name"] | (typeof WRITE_OPS)[number]["name"];

/** What the model sees for a failed call: a message plus, when useful, what to do next. */
function errorPayload(r: Extract<OpResult<unknown>, { ok: false }>) {
  return { error: r.error.message, ...(r.error.hint ? { hint: r.error.hint } : {}) };
}

/* ------------------------------------------------------------------ */
/*  Vercel AI SDK                                                       */
/* ------------------------------------------------------------------ */

/**
 * The operations as AI SDK tools for one caller. Failures come back as `{ error, hint }` values
 * (not exceptions) so the model reads them and recovers. Write tools are only included when the
 * context may write.
 */
export function toAiSdkTools(ctx: ToolCtx, opts: { includeWrites?: boolean } = {}): ToolSet {
  const includeWrites = opts.includeWrites ?? ctx.scopes.includes("network:write");
  const tools: ToolSet = {};
  for (const op of OPS) {
    if (op.access === "write" && !includeWrites) continue;
    tools[op.name] = tool({
      description: op.description,
      inputSchema: op.input,
      execute: async (input: unknown) => {
        const r = await runOp(op, ctx, input);
        return r.ok ? r.data : errorPayload(r);
      },
    } as never);
  }
  return tools;
}

/**
 * @deprecated v1 name. The chat route now builds its tools with `toAiSdkTools`; kept for callers
 * that only have an owner id (the in-app assistant: full access).
 */
export function networkTools(ownerId: string, timezone = "UTC"): ToolSet {
  return toAiSdkTools({ ownerId, scopes: ["network:read", "network:write"], actor: { via: "chat", client: "assistant", credential: "assistant" }, timezone });
}

/* ------------------------------------------------------------------ */
/*  MCP                                                                  */
/* ------------------------------------------------------------------ */

/** A fixed context, or one resolved per call from the MCP request (e.g. from `ctx.http.authInfo`). */
export type McpCtxSource = ToolCtx | ((serverCtx: ServerContext) => ToolCtx | Promise<ToolCtx>);

/** Renders an operation result as an MCP tool result: `structuredContent` plus the same JSON as text. */
export function toCallToolResult(r: OpResult<unknown>): CallToolResult {
  if (!r.ok) {
    const text = r.error.hint ? `${r.error.message}\n${r.error.hint}` : r.error.message;
    return { isError: true, content: [{ type: "text", text }], structuredContent: errorPayload(r) };
  }
  const data = r.data;
  const structured = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : { result: data };
  return { content: [{ type: "text", text: JSON.stringify(structured) }], structuredContent: structured };
}

/** Registers every operation on an MCP server. Scopes are enforced per call by `runOp`. */
export function registerMcpTools(server: McpServer, source: McpCtxSource): void {
  for (const op of OPS) {
    server.registerTool(
      op.name,
      {
        title: op.title,
        description: op.description,
        inputSchema: op.input,
        annotations: {
          title: op.title,
          readOnlyHint: op.access === "read",
          destructiveHint: false,
          idempotentHint: op.access === "read",
          openWorldHint: false,
        },
      },
      async (input: unknown, serverCtx: ServerContext) => {
        const ctx = typeof source === "function" ? await source(serverCtx) : source;
        return toCallToolResult(await runOp(op, ctx, input));
      },
    );
  }
}
