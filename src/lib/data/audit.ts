import "server-only";
import { and, eq, gte, like, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/**
 * Append-only audit trail for sensitive actions: writes made by the AI assistant or by an MCP
 * client, token creation/revocation, OAuth grants. Rows are never updated or deleted by the app.
 *
 * `actor` identifies the credential that acted ("chat", "mcp:pat:<token id>", "mcp:oauth:<client>",
 * "user"), so per-connection limits can be computed from the log itself.
 */

const { auditLog } = schema;

export type AuditEntry = {
  ownerId: string;
  actor: string;
  /** Dotted verb, e.g. "tool.add_note", "token.create", "grant.revoke". */
  action: string;
  entity?: string | null;
  entityId?: string | null;
  meta?: Record<string, unknown> | null;
};

export async function recordAudit(entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    ownerId: entry.ownerId,
    actor: entry.actor,
    action: entry.action,
    entity: entry.entity ?? null,
    entityId: entry.entityId ?? null,
    meta: entry.meta ?? null,
  });
}

/** How many `action`s (prefix match, e.g. "tool.") one actor performed since `since`. */
export async function countActions(ownerId: string, actor: string, opts: { since: Date; actionPrefix: string }): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(and(eq(auditLog.ownerId, ownerId), eq(auditLog.actor, actor), gte(auditLog.at, opts.since), like(auditLog.action, `${opts.actionPrefix}%`)));
  return row?.n ?? 0;
}
