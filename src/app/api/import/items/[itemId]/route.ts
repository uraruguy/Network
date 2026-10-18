import { z } from "zod";
import { withOwner, parseBody, notFound } from "@/lib/api-server";
import { db } from "@/lib/db";
import { commitItem, decisionSchema, reopenItem, skipItem } from "@/lib/data/import";
import { getImportItem } from "@/lib/data/import-review";

/** One import item with its note body and resolved mentions. */
export const GET = withOwner<{ itemId: string }>(async ({ ownerId, params }) => (await getImportItem(db, ownerId, params.itemId)) ?? notFound());

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
