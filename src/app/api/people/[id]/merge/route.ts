import { z } from "zod";
import { notFound, parseBody, parseQuery, withOwner } from "@/lib/api-server";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/data/audit";
import { getPerson } from "@/lib/data/people";
import { mergePeople } from "@/lib/data/people-merge";

/** `[id]` is the duplicate that goes away; `into` is the person who stays. */
const target = z.object({ into: z.string().uuid() });

/** Preview: what merging this person into `?into=` would move → MergeReport. A rolled-back dry run; nothing is saved. */
export const GET = withOwner<{ id: string }>(async ({ ownerId, params, url }) => {
  const { into } = parseQuery(url, target);
  return mergePeople(db, ownerId, into, params.id, { write: false });
});

/**
 * Merges this person into `into` (see mergePeople) → `{ person: kept PersonDetail, report }`.
 * Recorded in audit_log as person.merge, like the CLI; a failed audit write doesn't undo the merge.
 */
export const POST = withOwner<{ id: string }>(async ({ ownerId, params, req }) => {
  const { into } = await parseBody(req, target);
  const report = await mergePeople(db, ownerId, into, params.id, { write: true });
  await recordAudit({ ownerId, actor: "user", action: "person.merge", entity: "person", entityId: into, meta: { drop: report.drop, fields: report.fields, moved: report.moved } }).catch((err) =>
    console.error("[people] audit failed for person.merge", err),
  );
  return { person: (await getPerson(ownerId, into)) ?? notFound(), report };
});
