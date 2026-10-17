import { z } from "zod";
import { parseBody, withOwner } from "@/lib/api-server";
import { db } from "@/lib/db";
import { commitImport } from "@/lib/data/import-commit";
import { importCall } from "../_lib/http";

export const maxDuration = 300;

const body = z.object({
  source: z.string().regex(/^[a-z0-9-]{1,40}$/).default("apple-notes"),
  dryRun: z.boolean().default(true),
  limit: z.number().int().positive().max(500).optional(),
  /** Commit only these proposal keys (the review UI commits in chunks of the dry run's `keys`). */
  keys: z.array(z.string().min(1).max(100)).min(1).max(500).optional(),
  /** Reuse one commit id across chunks so a single rollback undoes the whole import. */
  commitId: z.string().uuid().optional(),
});

/**
 * Commits approved people + their notes (dry run by default). Returns counts and the commit id;
 * a dry run also returns `keys`, the proposals a real run would commit, in commit order.
 */
export const POST = withOwner(async ({ ownerId, req }) => {
  const b = await parseBody(req, body);
  const r = await importCall(() => commitImport(db, ownerId, { source: b.source, dryRun: b.dryRun, limit: b.limit, keys: b.keys, commitId: b.commitId }));
  const keys = b.dryRun ? [...r.people.results.map((x) => x.key), ...r.people.failed.map((f) => f.key)].sort() : undefined;
  return { ...r, people: { ...r.people, results: undefined }, keys };
});
