import { z } from "zod";
import { HttpError, parseBody, withOwner } from "@/lib/api-server";
import { db } from "@/lib/db";
import { ingestRows } from "@/lib/data/import-ingest";
import { cleanRows } from "@/lib/import/diff";

export const maxDuration = 120;

const body = z.object({
  source: z.string().regex(/^[a-z0-9-]{1,40}$/).default("apple-notes"),
  rows: z.array(z.unknown()).min(1).max(10_000),
  /** false → dry run: returns what would change, writes nothing. */
  write: z.boolean().default(false),
  label: z.string().trim().max(120).optional(),
});

/**
 * Incremental ingest of an Apple Notes export (no AI): new notes are staged for screening, changed
 * ones re-queued, deleted ones marked gone. Same code path as `pnpm import:ingest`.
 */
export const POST = withOwner(async ({ ownerId, req }) => {
  const b = await parseBody(req, body);
  let rows: ReturnType<typeof cleanRows>;
  try {
    rows = cleanRows(b.rows);
  } catch {
    throw new HttpError(422, "That file isn’t an Apple Notes export (expected the JSON from pnpm notes:export)");
  }
  const label = b.label ?? `Apple Notes · ${new Date().toISOString().slice(0, 10)}`;
  const r = await ingestRows(db, ownerId, rows.rows, { source: b.source, label, write: b.write });
  return { write: b.write, jobId: b.write ? r.jobId : null, notes: rows.rows.length, duplicates: rows.duplicates, counts: r.counts, staleProposals: r.staleProposals };
});
