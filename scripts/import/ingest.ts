/**
 * Ingest a clean Apple Notes export into import_items (no AI). Dry run unless --write.
 *   pnpm tsx scripts/import/ingest.ts <export.clean.json> [--label "Apple Notes 2026-10"] [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bootstrap, die, resolveOwner, run } from "./_env";

run(async () => {
  const ctx = bootstrap({ writes: true });
  const file = ctx.args.positionals[0] ?? die("usage: ingest.ts <export.clean.json> [--label L] [--write]");
  const { cleanRows } = await import("@/lib/import/diff");
  const { rows, duplicates } = cleanRows(JSON.parse(readFileSync(resolve(file), "utf8")));
  console.log(`${file}: ${rows.length} unique notes (${duplicates} duplicate rows collapsed)`);
  const owner = await resolveOwner(ctx);
  const { db } = await import("@/lib/db");
  const { ingestRows } = await import("@/lib/data/import-ingest");
  const label = ctx.args.opt("--label", `Apple Notes · ${new Date().toISOString().slice(0, 10)}`)!;
  const r = await ingestRows(db, owner.id, rows, { source: ctx.source, label, write: ctx.write });
  for (const [k, v] of Object.entries(r.counts).sort()) console.log(`  ${k.padEnd(24)} ${v}`);
  console.log(`  proposals flagged stale  ${r.staleProposals}`);
  const out = join(ctx.runDir, `ingest${ctx.write ? "" : ".dry"}.json`);
  writeFileSync(out, JSON.stringify({ file, write: ctx.write, jobId: ctx.write ? r.jobId : null, counts: r.counts, staleProposals: r.staleProposals, entries: r.entries.map((e) => ({ ...e, row: undefined })) }, null, 2));
  console.log(ctx.write ? `ingested (job ${r.jobId}) → ${out}` : `dry run — nothing written → ${out}`);
});
