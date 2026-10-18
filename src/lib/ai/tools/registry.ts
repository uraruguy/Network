import { z } from "zod";
import { countActions, recordAudit } from "@/lib/data/audit";
import { HttpError } from "@/lib/errors";

/**
 * The tool registry: every operation the AI can perform on the network is defined once with
 * `defineOp` and exposed through two adapters (see ./index.ts):
 *
 *   - `toAiSdkTools(ctx)`        → the in-app chat (Vercel AI SDK `streamText`)
 *   - `registerMcpTools(server)` → the MCP server at /api/mcp (Claude, ChatGPT, Cursor …)
 *
 * `runOp` is the single choke point both adapters go through. It validates input, enforces the
 * caller's scopes, rate-limits and audits writes, and turns failures into `ToolError`s with a
 * hint the model can act on. There are deliberately no delete operations.
 */

export const SCOPES = ["network:read", "network:write"] as const;
export type Scope = (typeof SCOPES)[number];

/** Who is calling. */
export type ToolActor = {
  /** The in-app assistant or an external MCP client. Stored as `source_kind` on created rows. */
  via: "chat" | "mcp";
  /** Human-readable client ("assistant", "Claude", "Cursor", a token name). Stored as `source_ref` on people. */
  client: string;
  /** Stable credential id for the audit log and rate limits: "assistant", "pat:<id>", "oauth:<client id>". */
  credential: string;
};

export type ToolCtx = {
  ownerId: string;
  scopes: readonly Scope[];
  actor: ToolActor;
  /** IANA zone of the owner (profile), for "today" and relative dates. */
  timezone: string;
};

export type OpAccess = "read" | "write";

/** Any zod object schema (tools take named arguments). */
export type OpInput = z.ZodObject<z.ZodRawShape>;

export type OpDefinition<S extends OpInput = OpInput, O = unknown> = {
  /** snake_case, stable: clients remember tool names. */
  name: string;
  /** Short human title (MCP clients show it in permission prompts). */
  title: string;
  /** What the tool does and when to use it — written for the model. */
  description: string;
  access: OpAccess;
  input: S;
  run: (ctx: ToolCtx, input: z.output<S>) => Promise<O>;
  /** Writes: what to record in the audit log (entity + id) for a successful call. */
  audit?: (result: O, input: z.output<S>) => { entity: string; entityId?: string | null };
};

/** Identity helper that keeps the input/output types of an operation. */
export function defineOp<S extends OpInput, O>(def: OpDefinition<S, O>): OpDefinition<S, O> {
  return def;
}

/** A failure the model (or the person behind it) can act on. */
export class ToolError extends Error {
  constructor(
    public code: "invalid_input" | "forbidden" | "not_found" | "ambiguous" | "rate_limited" | "failed",
    message: string,
    public hint?: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

export type OpResult<O> = { ok: true; data: O } | { ok: false; error: { code: ToolError["code"]; message: string; hint?: string } };

/** Writes per hour allowed for one MCP credential (token or OAuth grant). The in-app chat is not limited. */
export const MCP_WRITES_PER_HOUR = 60;

export const canWrite = (scopes: readonly Scope[]) => scopes.includes("network:write");
export const canRead = (scopes: readonly Scope[]) => scopes.includes("network:read") || canWrite(scopes);

/** The audit-log actor string for a context, e.g. "chat:assistant" or "mcp:pat:3f2…". */
export const auditActor = (actor: ToolActor) => `${actor.via}:${actor.credential}`;

/** Provenance for rows created by a tool (`source_kind` / `source_ref`). */
export const sourceOf = (ctx: ToolCtx) => ({ kind: ctx.actor.via, ref: ctx.actor.client.slice(0, 120) });

/**
 * Provenance for notes: the kind only. A note's (`source_kind`, `source_ref`) is unique while live
 * (it is the import's idempotency key), so a per-client ref would allow one note per client.
 */
export const noteSourceOf = (ctx: ToolCtx) => ({ kind: ctx.actor.via, ref: null });

function formatIssues(error: z.ZodError) {
  return error.issues
    .slice(0, 5)
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");
}

async function enforceRateLimit(ctx: ToolCtx) {
  if (ctx.actor.via !== "mcp") return;
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const used = await countActions(ctx.ownerId, auditActor(ctx.actor), { since, actionPrefix: "tool." });
  if (used >= MCP_WRITES_PER_HOUR) {
    throw new ToolError(
      "rate_limited",
      `Write limit reached: this connection may make ${MCP_WRITES_PER_HOUR} changes per hour.`,
      "Tell the user the limit was hit and to try again later, or to make the change in The Network app. Reading still works.",
    );
  }
}

/**
 * Runs one operation for a caller: validate → authorize → (rate-limit) → run → (audit).
 * Never throws; adapters render the result.
 */
export async function runOp<S extends OpInput, O>(op: OpDefinition<S, O>, ctx: ToolCtx, rawInput: unknown): Promise<OpResult<O>> {
  try {
    if (op.access === "write" ? !canWrite(ctx.scopes) : !canRead(ctx.scopes)) {
      throw new ToolError(
        "forbidden",
        op.access === "write" ? "This connection is read-only, so it can't change your network." : "This connection has no access to your network.",
        op.access === "write"
          ? "Tell the user to reconnect with “Read & write” access (The Network → Settings → Connected apps), or make the change in the app."
          : undefined,
      );
    }
    const parsed = op.input.safeParse(rawInput ?? {});
    if (!parsed.success) throw new ToolError("invalid_input", `Invalid arguments: ${formatIssues(parsed.error)}`);
    const input = parsed.data as z.output<S>;

    if (op.access === "write") await enforceRateLimit(ctx);
    const data = await op.run(ctx, input);

    if (op.access === "write") {
      const target = op.audit?.(data, input);
      // The change already happened: a failed audit write must not turn it into an error.
      await recordAudit({
        ownerId: ctx.ownerId,
        actor: auditActor(ctx.actor),
        action: `tool.${op.name}`,
        entity: target?.entity ?? null,
        entityId: target?.entityId ?? null,
        meta: { via: ctx.actor.via, client: ctx.actor.client },
      }).catch((err) => console.error(`[tools] audit failed for ${op.name}`, err));
    }
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ToolError) return { ok: false, error: { code: err.code, message: err.message, hint: err.hint } };
    if (err instanceof HttpError && err.status === 404) return { ok: false, error: { code: "not_found", message: err.message } };
    if (err instanceof HttpError && err.status < 500) return { ok: false, error: { code: "invalid_input", message: err.message } };
    console.error(`[tools] ${op.name} failed`, err);
    return { ok: false, error: { code: "failed", message: `${op.title} failed unexpectedly.`, hint: "Try again once; if it keeps failing, tell the user." } };
  }
}
