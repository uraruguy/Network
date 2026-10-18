import { afterAll, describe, expect, it, vi } from "vitest";

/** Opt-in: runs against the LOCAL database only (TEST_DATABASE_URL, like test/db.integration.test.ts). */
const local = vi.hoisted(() => {
  const url = process.env.TEST_DATABASE_URL;
  const ok = !!url && /@(127\.0\.0\.1|localhost)[:/]/.test(url);
  if (ok) process.env.DATABASE_URL = url;
  return ok;
});

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { approvalEvidence } from "./approval-log";
import { isApprovedSession } from "./approvals";

describe.skipIf(!local)("approvalEvidence (local database)", () => {
  const client = `test-client-${Date.now()}`;
  let ownerId: string | null = null;
  afterAll(async () => {
    if (ownerId) await db.execute(sql`delete from audit_log where owner_id = ${ownerId} and (entity_id = ${client} or meta->>'redirect' = ${client})`);
  });

  const at = (iso: string) => new Date(iso);
  async function event(action: string, iso: string, entityId: string | null, meta: Record<string, unknown> | null = null) {
    await db.execute(sql`insert into audit_log (owner_id, at, actor, action, entity, entity_id, meta) values (${ownerId}, ${iso}::timestamptz, 'user', ${action}, 'oauth_client', ${entityId}, ${meta ? JSON.stringify(meta) : null}::jsonb)`);
  }

  it("finds approvals in the window and later disconnects", async () => {
    const [owner] = await db.execute<{ id: string }>(sql`select id from profiles limit 1`);
    if (!owner) return;
    ownerId = owner.id;
    await event("grant.approve", "2001-01-01T10:00:00Z", client);
    await event("grant.revoke", "2001-01-02T10:00:00Z", client);
    await event("grant.approve", "2001-01-03T10:00:00Z", client);
    await event("grant.reauthorize", "2001-01-04T10:00:00Z", null, { redirect: client });

    // Minted 30 s after the first approval, then disconnected: refused even though re-approved later.
    const first = await approvalEvidence(owner.id, client, at("2001-01-01T10:00:30Z"));
    expect(first.approvedAt?.toISOString()).toBe("2001-01-01T10:00:00.000Z");
    expect(isApprovedSession(first)).toBe(false);

    // Minted after the re-approval: fine.
    expect(isApprovedSession(await approvalEvidence(owner.id, client, at("2001-01-03T10:02:00Z")))).toBe(true);
    // Minted an hour after any approval (password-only Supabase session): refused.
    expect(await approvalEvidence(owner.id, client, at("2001-01-03T11:00:00Z"))).toMatchObject({ approvedAt: null });
    // A "Continue" for an app approved before counts for any client.
    expect(isApprovedSession(await approvalEvidence(owner.id, client, at("2001-01-04T10:00:05Z")))).toBe(true);
    // Another client's approval doesn't count.
    expect((await approvalEvidence(owner.id, `${client}-other`, at("2001-01-03T10:02:00Z"))).approvedAt).toBeNull();
  });
});
