import { notFound, parseBody, withOwner } from "@/lib/api-server";
import { db } from "@/lib/db";
import { decideProposal, decisionInput, proposalEvidence } from "@/lib/data/import-review";
import { importCall } from "../../_lib/http";

/** Every mention of one proposal (all notes it appears in), for "All notes" and the split dialog. */
export const GET = withOwner<{ id: string }>(async ({ ownerId, params }) => (await proposalEvidence(db, ownerId, params.id)) ?? notFound());

/** approve {matchPersonId?} | reject | passerby | merge {intoId} | split {mentionIds, displayName} | edit {…} | reopen | undo */
export const PATCH = withOwner<{ id: string }>(async ({ ownerId, params, req }) => {
  const input = await parseBody(req, decisionInput);
  const p = await importCall(() => decideProposal(ownerId, params.id, input));
  return { id: p.id, key: p.key, status: p.status, disposition: p.disposition, needsReview: p.needsReview, mergedIntoId: p.mergedIntoId, decidedBy: p.decidedBy };
});
