/**
 * Read-only diff of a new clean export against a previous export file and against import_items.
 *   pnpm tsx scripts/import/diff.ts <new.clean.json> [--prev <old.clean.json>] [--run <id>]
 * → .cache/import/<run>/diff.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bootstrap, die, resolveOwner, run } from "./_env";

run(async () => {
  const ctx = bootstrap();
  const file = ctx.args.positionals[0] ?? die("usage: diff.ts <new.clean.json> [--prev <old.json>]");
  const { cleanRows, diffAgainstItems, diffFiles, summarizeDiff } = await import("@/lib/import/diff");
  const next = cleanRows(JSON.parse(readFileSync(resolve(file), "utf8")));
  console.log(`${file}: ${next.rows.length} unique notes (${next.duplicates} duplicate rows collapsed, ${next.rows.filter((r) => r.locked).length} locked)`);

  let vsFile: ReturnType<typeof diffFiles> | null = null;
  const prevPath = ctx.args.opt("--prev");
  if (prevPath) {
    const prev = cleanRows(JSON.parse(readFileSync(resolve(prevPath), "utf8")));
    vsFile = diffFiles(prev.rows, next.rows);
    console.log(`vs ${prevPath}: new ${vsFile.new.length} · changed ${vsFile.changed.length} · title/html only ${vsFile.titleOnly.length} · unchanged ${vsFile.unchanged} · gone ${vsFile.gone.length}`);
  }

  const owner = await resolveOwner(ctx);
  const { db } = await import("@/lib/db");
  const { loadExistingItems } = await import("@/lib/data/import-ingest");
  const existing = await loadExistingItems(db, owner.id, ctx.source);
  const entries = diffAgainstItems(next.rows, existing);
  const counts = summarizeDiff(entries);
  console.log(`vs import_items (${existing.length} rows, source ${ctx.source}):`);
  for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${k.padEnd(24)} ${v}`);
  const titles = (kind: string) => entries.filter((e) => e.kind === kind).map((e) => `${e.title ?? "(untitled)"}${e.prevStatus ? ` [${e.prevStatus}]` : ""}`);
  for (const k of ["new", "changed", "meta", "gone", "returned"]) {
    const t = titles(k);
    if (t.length) console.log(`\n${k} (${t.length}):\n  ${t.slice(0, 25).join("\n  ")}${t.length > 25 ? `\n  … ${t.length - 25} more` : ""}`);
  }
  const out = join(ctx.runDir, "diff.json");
  writeFileSync(
    out,
    JSON.stringify(
      {
        file,
        prev: prevPath ?? null,
        vsFile,
        counts,
        entries: entries.map((e) => ({ ...e, row: undefined })),
      },
      null,
      2,
    ),
  );
  console.log(`\n→ ${out}`);
});
