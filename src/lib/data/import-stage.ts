/** Data access for the AI stages (screen, extract) run by scripts/import/run-stage.ts. */
import { and, asc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { schema } from "@/lib/db";
import { importItemsX } from "@/lib/db/schema-import";
import type { ExtractionV2, ScreenItem } from "@/lib/import/contracts";
import type { DbOrTx } from "./import-shared";

const base = (ownerId: string, source: string) => and(eq(importItemsX.ownerId, ownerId), eq(importItemsX.source, source), isNull(importItemsX.goneAt));

/** Notes to screen: pending, plus (with `rescreen`) notes the first run skipped after reading only 700 chars. */
export async function itemsToScreen(db: DbOrTx, ownerId: string, source: string, opts: { limit: number; rescreen: boolean; ids?: string[] }) {
  return db
    .select({ id: importItemsX.id, title: importItemsX.title, text: importItemsX.text, folders: importItemsX.folders, status: importItemsX.status, screenedWith: importItemsX.screenedWith, decision: importItemsX.decision })
    .from(importItemsX)
    .where(
      and(
        base(ownerId, source),
        opts.ids?.length ? inArray(importItemsX.id, opts.ids) : undefined,
        or(
          eq(importItemsX.status, "pending"),
          opts.rescreen ? and(eq(importItemsX.status, "skipped"), like(importItemsX.screenedWith, "head700%"), eq(importItemsX.dismissedReason, "screen:not_people")) : undefined,
        ),
      ),
    )
    .orderBy(asc(importItemsX.externalCreatedAt), asc(importItemsX.id))
    .limit(opts.limit);
}

export async function applyScreen(
  db: DbOrTx,
  item: { id: string; status: string; screenedWith: string | null; decision: unknown },
  r: ScreenItem,
  screenedWith: string,
  override?: { kind: ScreenItem["kind"]; why: string },
) {
  const kind = override?.kind ?? r.kind;
  const wasSkipped = item.status === "skipped";
  const screen = {
    kind,
    modelKind: r.kind,
    confidence: r.confidence,
    reason: override?.why ?? r.reason ?? null,
    peopleHint: r.peopleHint,
    previous: item.screenedWith,
    rescued: wasSkipped && kind !== "not_people",
    at: new Date().toISOString(),
  };
  const decision = { ...((item.decision as Record<string, unknown> | null) ?? {}), screen };
  await db
    .update(importItemsX)
    .set({
      classification: kind,
      classificationConfidence: r.confidence,
      screenedWith,
      decision,
      status: kind === "not_people" ? "skipped" : "classified",
      dismissedReason: kind === "not_people" ? "screen:not_people" : null,
      error: null,
    })
    .where(eq(importItemsX.id, item.id));
  return screen;
}

export async function itemsToExtract(db: DbOrTx, ownerId: string, source: string, opts: { limit: number; ids?: string[] }) {
  return db
    .select({
      id: importItemsX.id,
      title: importItemsX.title,
      text: importItemsX.text,
      folders: importItemsX.folders,
      classification: importItemsX.classification,
      externalCreatedAt: importItemsX.externalCreatedAt,
    })
    .from(importItemsX)
    .where(and(base(ownerId, source), eq(importItemsX.status, "classified"), opts.ids?.length ? inArray(importItemsX.id, opts.ids) : undefined))
    .orderBy(asc(importItemsX.externalCreatedAt), asc(importItemsX.id))
    .limit(opts.limit);
}

export async function applyExtraction(db: DbOrTx, itemId: string, ex: ExtractionV2) {
  await db.update(importItemsX).set({ candidates: ex, extractionVersion: ex.version, status: "extracted", error: null }).where(eq(importItemsX.id, itemId));
}

export async function markFailed(db: DbOrTx, itemId: string, error: string) {
  await db.update(importItemsX).set({ status: "failed", error: error.slice(0, 2000) }).where(eq(importItemsX.id, itemId));
}

/** Failed items go back to the last completed stage (classified ones only redo extraction). */
export async function requeueFailed(db: DbOrTx, ownerId: string, source: string) {
  const scope = and(base(ownerId, source), eq(importItemsX.status, "failed"));
  const a = await db
    .update(importItemsX)
    .set({ status: "classified", error: null })
    .where(and(scope, sql`${importItemsX.classification} is not null and ${importItemsX.classification} <> 'not_people'`))
    .returning({ id: importItemsX.id });
  const b = await db.update(importItemsX).set({ status: "pending", error: null }).where(scope).returning({ id: importItemsX.id });
  return a.length + b.length;
}

export async function existingPeopleNames(db: DbOrTx, ownerId: string) {
  const rows = await db
    .select({ name: schema.people.displayName })
    .from(schema.people)
    .where(and(eq(schema.people.ownerId, ownerId), isNull(schema.people.deletedAt)));
  return rows.map((r) => r.name);
}

export async function stageCounts(db: DbOrTx, ownerId: string, source: string) {
  const rows = await db
    .select({ status: importItemsX.status, n: sql<number>`count(*)::int` })
    .from(importItemsX)
    .where(base(ownerId, source))
    .groupBy(importItemsX.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}
