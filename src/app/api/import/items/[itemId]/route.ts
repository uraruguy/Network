import { z } from "zod";
import { withOwner, parseBody } from "@/lib/api-server";
import { commitItem, decisionSchema, reopenItem, skipItem } from "@/lib/data/import";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("commit"), decision: decisionSchema }),
  z.object({ action: z.literal("skip") }),
  z.object({ action: z.literal("reopen") }),
]);

export const POST = withOwner<{ itemId: string }>(async ({ ownerId, params, req }) => {
  const b = await parseBody(req, body);
  if (b.action === "commit") return commitItem(ownerId, params.itemId, b.decision);
  if (b.action === "skip") await skipItem(ownerId, params.itemId);
  else await reopenItem(ownerId, params.itemId);
  return { ok: true };
});
