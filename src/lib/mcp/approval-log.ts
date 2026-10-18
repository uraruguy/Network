import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAudit } from "@/lib/data/audit";
import { APPROVAL_ACTIONS, approvalWindow, type ApprovalEvidence } from "./approvals";

/**
 * Reads and writes the approval events of approvals.ts in the append-only audit log (the app
 * never updates or deletes those rows, so they are a trustworthy record of what was approved).
 * One indexed range scan on `audit_log (owner_id, at desc)`; callers cache the verdict.
 */

const { auditLog } = schema;

export async function approvalEvidence(ownerId: string, clientId: string, sessionStart: Date): Promise<ApprovalEvidence> {
  const { from, to } = approvalWindow(sessionStart);
  const [row] = await db
    .select({
      approvedAt: sql<Date | null>`max(${auditLog.at}) filter (where ${auditLog.at} <= ${to.toISOString()}::timestamptz and (${auditLog.action} = ${APPROVAL_ACTIONS.reauthorize} or (${auditLog.action} = ${APPROVAL_ACTIONS.approve} and ${auditLog.entityId} = ${clientId})))`.mapWith(auditLog.at),
      revokedAt: sql<Date | null>`max(${auditLog.at}) filter (where ${auditLog.action} = ${APPROVAL_ACTIONS.revoke} and ${auditLog.entityId} = ${clientId})`.mapWith(auditLog.at),
    })
    .from(auditLog)
    .where(and(eq(auditLog.ownerId, ownerId), gte(auditLog.at, from), inArray(auditLog.action, Object.values(APPROVAL_ACTIONS))));
  return { approvedAt: row?.approvedAt ?? null, revokedAt: row?.revokedAt ?? null };
}

/** Consent form approved (passkey-verified): what was approved, and when. */
export function recordApproval(ownerId: string, client: { id: string; name: string | null }, approved: { scopes: string[]; redirectUri: string }) {
  return recordAudit({
    ownerId,
    actor: "user",
    action: APPROVAL_ACTIONS.approve,
    entity: "oauth_client",
    entityId: client.id,
    meta: { name: client.name, scopes: approved.scopes, redirectUri: approved.redirectUri },
  });
}

/** An already-consented client came back and the owner (passkey-verified) chose to continue. */
export function recordReauthorization(ownerId: string, redirect: string) {
  return recordAudit({ ownerId, actor: "user", action: APPROVAL_ACTIONS.reauthorize, entity: "oauth_client", entityId: null, meta: { redirect } });
}
