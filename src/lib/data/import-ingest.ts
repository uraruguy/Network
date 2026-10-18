/**
 * Incremental ingest of an Apple Notes export into import_items (no AI).
 *   new                    → pending (empty → skipped "empty", locked → skipped "locked")
 *   changed + extracted    → classified (re-extract; old mentions deleted, touched proposals flagged stale)
 *   changed + committed    → classified, note_id kept (the committed note is updated in place on commit)
 *   changed + skipped/failed/pending → pending (re-screen)
 *   title/html/folder only → updated silently
 *   gone from the export   → gone_at set (nothing is deleted)
 * A batch row in import_jobs records each ingest; everything downstream selects by `source`.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { schema } from "@/lib/db";
import { importItemsX, importMentions, importPeople } from "@/lib/db/schema-import";
import { diffAgainstItems, summarizeDiff, type CleanRow, type DiffEntry, type ExistingItem } from "@/lib/import/diff";
import { inTransaction, type DbOrTx, type Tx } from "./import-shared";

export async function loadExistingItems(db: DbOrTx, ownerId: string, source: string): Promise<ExistingItem[]> {
  return db
    .select({
      id: importItemsX.id,
      externalId: importItemsX.externalId,
      contentHash: importItemsX.contentHash,
      status: importItemsX.status,
      title: importItemsX.title,
      html: importItemsX.html,
      folders: importItemsX.folders,
      goneAt: importItemsX.goneAt,
      noteId: importItemsX.noteId,
    })
    .from(importItemsX)
    .where(and(eq(importItemsX.ownerId, ownerId), eq(importItemsX.source, source)));
}

const date = (s: string | null | undefined) => (s ? new Date(s) : null);

export type IngestResult = { jobId: string; counts: Record<string, number>; staleProposals: number; entries: DiffEntry[] };

/** Flags proposals whose evidence changed: back to review unless Jakob decided them himself. */
async function flagStale(tx: Tx, ownerId: string, itemIds: string[]) {
  if (!itemIds.length) return 0;
  const touched = await tx
    .selectDistinct({ id: importMentions.importPersonId })
    .from(importMentions)
    .where(and(eq(importMentions.ownerId, ownerId), inArray(importMentions.itemId, itemIds)));
  const ids = touched.map((t) => t.id).filter((x): x is string => !!x);
  if (!ids.length) return 0;
  const res = await tx
    .update(importPeople)
    .set({
      reviewFlags: sql`array(select distinct unnest(${importPeople.reviewFlags} || array['stale']::text[]))`,
      needsReview: sql`case when ${importPeople.decidedBy} = 'user' then ${importPeople.needsReview} else true end`,
      status: sql`case when ${importPeople.decidedBy} = 'user' then ${importPeople.status} else 'proposed'::import_person_status end`,
    })
    .where(and(eq(importPeople.ownerId, ownerId), inArray(importPeople.id, ids), inArray(importPeople.status, ["proposed", "approved", "rejected"])))
    .returning({ id: importPeople.id });
  return res.length;
}

/** Applies an export to import_items. Dry run (rolled back) unless `write`. */
export async function ingestRows(db: DbOrTx, ownerId: string, rows: CleanRow[], opts: { source: string; label: string; write: boolean }): Promise<IngestResult> {
  return inTransaction(db, opts.write, async (tx) => {
    const existing = await loadExistingItems(tx, ownerId, opts.source);
    const entries = diffAgainstItems(rows, existing);
    const staleProposals = await flagStale(
      tx,
      ownerId,
      entries.filter((e) => e.kind === "changed" && e.prevStatus !== "committed" && e.itemId).map((e) => e.itemId!),
    );
    const staged = entries.filter((e) => e.kind === "new" || e.kind === "changed").length;
    const [job] = await tx
      .insert(schema.importJobs)
      .values({ ownerId, source: opts.source, label: opts.label, totalItems: staged })
      .returning({ id: schema.importJobs.id });
    const jobId = job!.id;
    const now = new Date();
    const content = (r: CleanRow) => ({
      title: r.title,
      html: r.html,
      text: r.text,
      folder: r.folders[0] ?? null,
      folders: r.folders,
      externalCreatedAt: date(r.created),
      externalModifiedAt: date(r.modified),
      contentHash: r.hash,
      goneAt: null,
    });
    const resetStage = { classification: null, classificationConfidence: null, candidates: null, extractionVersion: null, screenedWith: null, dismissedReason: null, error: null };

    for (const e of entries) {
      const r = e.row;
      switch (e.kind) {
        case "new": {
          const empty = !r!.text && !r!.html;
          await tx.insert(importItemsX).values({
            ownerId,
            jobId,
            source: opts.source,
            externalId: r!.id,
            ...content(r!),
            status: empty ? "skipped" : "pending",
            dismissedReason: empty ? "empty" : null,
          });
          break;
        }
        case "locked":
          if (!e.itemId) await tx.insert(importItemsX).values({ ownerId, jobId, source: opts.source, externalId: r!.id, ...content(r!), status: "skipped", dismissedReason: "locked" });
          else if (e.prevStatus !== "committed") await tx.update(importItemsX).set({ status: "skipped", dismissedReason: "locked", goneAt: null }).where(eq(importItemsX.id, e.itemId));
          break;
        case "changed": {
          const prev = e.prevStatus;
          if (prev === "extracted" || prev === "approved" || prev === "committed" || prev === "classified") {
            await tx.delete(importMentions).where(and(eq(importMentions.ownerId, ownerId), eq(importMentions.itemId, e.itemId!)));
            await tx
              .update(importItemsX)
              .set({ jobId, ...content(r!), status: "classified", candidates: null, extractionVersion: null, error: null })
              .where(eq(importItemsX.id, e.itemId!));
          } else {
            await tx.update(importItemsX).set({ jobId, ...content(r!), ...resetStage, status: "pending" }).where(eq(importItemsX.id, e.itemId!));
          }
          break;
        }
        case "meta":
          await tx
            .update(importItemsX)
            .set({ title: r!.title, html: r!.html, folder: r!.folders[0] ?? null, folders: r!.folders, externalModifiedAt: date(r!.modified) })
            .where(eq(importItemsX.id, e.itemId!));
          break;
        case "returned":
          await tx.update(importItemsX).set({ goneAt: null, title: r!.title, html: r!.html, folders: r!.folders }).where(eq(importItemsX.id, e.itemId!));
          break;
        case "gone":
          await tx.update(importItemsX).set({ goneAt: now }).where(eq(importItemsX.id, e.itemId!));
          break;
        case "unchanged":
          break;
      }
    }
    return { jobId, counts: summarizeDiff(entries), staleProposals, entries };
  });
}
