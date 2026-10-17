import { z } from "zod";
import { parseBody, withOwner } from "@/lib/api-server";
import { db } from "@/lib/db";
import { batchSummary, dismissNoPeople, restoreGone, setFolderTags } from "@/lib/data/import-batch";
import { sourceParam } from "../_lib/http";

/** Batch decisions for the end of the review: deleted notes, notes without people, folders → tags. */
export const GET = withOwner(async ({ ownerId, url }) => batchSummary(db, ownerId, sourceParam(url)));

const source = z.string().regex(/^[a-z0-9-]{1,40}$/).default("apple-notes");
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("restore-gone"), source }),
  z.object({ action: z.literal("dismiss-no-people"), source }),
  z.object({ action: z.literal("folder-tags"), source, changes: z.array(z.object({ folder: z.string().min(1).max(200), on: z.boolean() })).min(1).max(100) }),
]);

export const POST = withOwner(async ({ ownerId, req }) => {
  const b = await parseBody(req, body);
  if (b.action === "restore-gone") return restoreGone(db, ownerId, b.source);
  if (b.action === "dismiss-no-people") return dismissNoPeople(db, ownerId, b.source);
  return setFolderTags(db, ownerId, b.source, b.changes);
});
