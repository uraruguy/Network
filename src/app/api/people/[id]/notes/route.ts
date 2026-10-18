import { z } from "zod";
import { parseQuery, withOwner } from "@/lib/api-server";
import { listNotes } from "@/lib/data/notes";

const query = z.object({
  before: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  full: z.enum(["1", "true", "0", "false"]).optional(),
});

/**
 * GET ?before=<cursor>&limit=30&full=1 → { items: NoteSummary[] (newest first), nextCursor }
 * Without `full`, each note has a 280-char `excerpt`; with it, also contentText/contentMd/contentJson.
 */
export const GET = withOwner<{ id: string }>(async ({ ownerId, params, url }) => {
  const q = parseQuery(url, query);
  return listNotes(ownerId, params.id, { before: q.before, limit: q.limit, full: q.full === "1" || q.full === "true" });
});
