import { parseBody, withOwner } from "@/lib/api-server";
import { decideProposal, decisionInput } from "@/lib/data/import-review";
import { importCall } from "../../_lib/http";

/** approve | reject | passerby | merge {intoId} | split {mentionIds, displayName} | edit {…} | reopen | undo */
export const PATCH = withOwner<{ id: string }>(async ({ ownerId, params, req }) => {
  const input = await parseBody(req, decisionInput);
  const p = await importCall(() => decideProposal(ownerId, params.id, input));
  return { id: p.id, key: p.key, status: p.status, disposition: p.disposition, needsReview: p.needsReview, mergedIntoId: p.mergedIntoId, decidedBy: p.decidedBy };
});
