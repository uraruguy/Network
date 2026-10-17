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
});

/** Commits approved people + their notes (dry run by default). Returns counts and the commit id. */
export const POST = withOwner(async ({ ownerId, req }) => {
  const b = await parseBody(req, body);
  const r = await importCall(() => commitImport(db, ownerId, { source: b.source, dryRun: b.dryRun, limit: b.limit }));
  return { ...r, people: { ...r.people, results: undefined } };
});
