/**
 * LOCAL ONLY. Seeds 30 synthetic notes (fake people, Slovenian/English) with hand-written
 * extractions as `extracted` import_items, so the resolve → apply → commit → verify → rollback path
 * can be rehearsed without running AI.
 *   pnpm tsx scripts/import/seed-fixture.ts [--screen-rest] [--write]
 * --screen-rest marks every other pending note of the source as screened not_people (simulates the
 * screen stage that needs the subscription).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bootstrap, die, resolveOwner, run } from "./_env";

type FixtureNote = {
  id: string;
  title: string;
  folder: string;
  daysAgo: number;
  classification: string;
  rescued?: boolean;
  text: string;
  extraction: { version: 1 | 2; noteSummary: string; occurredAt?: string | null; mode?: string; candidates: Record<string, unknown>[] };
};

const V2_NULLS = ["gender", "role", "company", "city", "country", "metContext", "metDate", "metCity", "warmth", "circle", "introducedBy", "howICanHelp", "whatICanAsk", "excerpt"];

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const toHtml = (text: string) => text.split("\n").map((l) => (l.trim() ? `<div>${escape(l)}</div>` : "<div><br></div>")).join("");

run(async () => {
  const ctx = bootstrap({ writes: true });
  if (!ctx.isLocal) die("seed-fixture only runs against the local database", 3);
  const owner = await resolveOwner(ctx);
  const { db } = await import("@/lib/db");
  const { sql, and, eq } = await import("drizzle-orm");
  const { schema } = await import("@/lib/db");
  const { importItemsX } = await import("@/lib/db/schema-import");
  const { ExtractionV2 } = await import("@/lib/import/contracts");
  const { contentHash } = await import("@/lib/import/diff");
  const { inTransaction } = await import("@/lib/data/import-shared");

  const here = dirname(fileURLToPath(import.meta.url));
  const notes = JSON.parse(readFileSync(join(here, "__fixtures__", "notes.json"), "utf8")) as FixtureNote[];
  const now = Date.now();

  const res = await inTransaction(db, ctx.write, async (tx) => {
    const [job] = await tx.insert(schema.importJobs).values({ ownerId: owner.id, source: ctx.source, label: "Fixture (synthetic)", totalItems: notes.length }).returning({ id: schema.importJobs.id });
    let inserted = 0;
    for (const n of notes) {
      const created = new Date(now - n.daysAgo * 86_400_000);
      const extraction =
        n.extraction.version === 2
          ? ExtractionV2.parse({
              suggestedTitle: n.title,
              occurredAt: null,
              ...n.extraction,
              candidates: n.extraction.candidates.map((c) => ({ ...Object.fromEntries(V2_NULLS.map((k) => [k, null])), aliases: [], ...c })),
            })
          : n.extraction;
      const values = {
        ownerId: owner.id,
        jobId: job!.id,
        source: ctx.source,
        externalId: n.id,
        title: n.title,
        html: toHtml(n.text),
        text: n.text.trim(),
        folder: n.folder,
        folders: [n.folder],
        externalCreatedAt: created,
        externalModifiedAt: created,
        contentHash: contentHash(n.text),
        classification: n.classification,
        classificationConfidence: 0.9,
        candidates: extraction,
        extractionVersion: n.extraction.version,
        status: "extracted" as const,
        screenedWith: "fixture",
        decision: { screen: { kind: n.classification, confidence: 0.9, reason: "fixture", previous: n.rescued ? "head700:openrouter" : null, rescued: !!n.rescued } },
        goneAt: null,
        dismissedReason: null,
      };
      await tx
        .insert(importItemsX)
        .values(values)
        .onConflictDoUpdate({ target: [importItemsX.ownerId, importItemsX.externalId], set: { ...values, noteId: null } });
      inserted++;
    }
    let screened = 0;
    if (ctx.args.flag("--screen-rest")) {
      const r = await tx
        .update(importItemsX)
        .set({ status: "skipped", classification: "not_people", screenedWith: "fixture-screen", dismissedReason: "screen:not_people" })
        .where(and(eq(importItemsX.ownerId, owner.id), eq(importItemsX.source, ctx.source), eq(importItemsX.status, "pending"), sql`${importItemsX.externalId} not like 'fixture://%'`))
        .returning({ id: importItemsX.id });
      screened = r.length;
    }
    return { inserted, screened };
  });
  console.log(`fixture notes upserted: ${res.inserted} · other pending notes marked screened: ${res.screened}`);
  console.log(ctx.write ? "seeded" : "dry run — rolled back (pass --write)");
});
