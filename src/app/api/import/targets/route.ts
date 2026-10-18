import { z } from "zod";
import { parseQuery, withOwner } from "@/lib/api-server";
import { db } from "@/lib/db";
import { searchMergeTargets } from "@/lib/data/import-review";

const query = z.object({
  source: z.string().regex(/^[a-z0-9-]{1,40}$/).default("apple-notes"),
  q: z.string().max(100).default(""),
  exclude: z.string().uuid().optional(),
});

/** Merge targets for a proposal: existing people + other proposals, matched on name and aliases. */
export const GET = withOwner(async ({ ownerId, url }) => {
  const q = parseQuery(url, query);
  return { items: await searchMergeTargets(db, ownerId, q.source, q.q, q.exclude) };
});
