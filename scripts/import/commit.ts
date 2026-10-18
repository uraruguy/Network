/**
 * Commits approved people and their notes into The Network.
 *   pnpm tsx scripts/import/commit.ts --run <id> [--limit N] [--keys a,b] [--write] [--atomic] [--concurrency 4]
 * Without --write (or with --dry-run) everything runs in one transaction that is rolled back,
 * and the counts are printed. With --write each person and note commits on its own (resumable:
 * re-run after a dropped connection and it continues); --atomic makes it one transaction instead.
 * Every write is logged in import_commit_log (see rollback.ts).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { bootstrap, resolveOwner, run } from "./_env";

run(async () => {
  const ctx = bootstrap({ writes: true });
  const owner = await resolveOwner(ctx);
  const { db } = await import("@/lib/db");
  const { commitImport } = await import("@/lib/data/import-commit");
  const limit = ctx.args.opt("--limit");
  const keys = ctx.args.opts("--keys");
  const atomic = !ctx.write || ctx.args.flag("--atomic");
  const concurrency = atomic ? 1 : Number(ctx.args.opt("--concurrency") ?? 4);
  if (ctx.write) console.log(`· ${atomic ? "atomic (one transaction)" : `resumable (per person / note, ${concurrency} at a time)`}`);
  const t0 = Date.now();
  const r = await commitImport(db, owner.id, {
    source: ctx.source,
    dryRun: !ctx.write,
    limit: limit ? Number(limit) : undefined,
    keys: keys.length ? keys : undefined,
    atomic,
    concurrency,
    onProgress: (phase, done, total) => {
      if (done % 10 === 0 || done === total) console.log(`  ${phase} ${done}/${total} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    },
  });
  console.log(`commit ${r.commitId}${r.dryRun ? " (DRY RUN — rolled back)" : ""} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`people:  created ${r.people.created} · updated ${r.people.updated} · unchanged ${r.people.unchanged} · failed ${r.people.failed.length}`);
  console.log(`notes:   created ${r.notes.created} · updated ${r.notes.updated} · unchanged ${r.notes.unchanged} · excerpts ${r.notes.excerpts} · mention links ${r.notes.mentions} · waiting on review ${r.notes.waiting} · partially linked (people still in review) ${r.notes.partial} · failed ${r.notes.failed.length}`);
  console.log(`reminders planned ${r.reminders} · introductions ${r.introductions}`);
  console.log(`log:     ${Object.entries(r.log).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  for (const f of r.people.failed) console.log(`  ✗ person ${f.key}: ${f.error}`);
  for (const f of r.notes.failed) console.log(`  ✗ note “${f.title}”: ${f.error}`);
  for (const s of r.people.skipped) console.log(`  – person ${s.key}: ${s.reason}`);
  if (r.notes.deleted || r.notes.edited) console.log(`kept:    ${r.notes.deleted} notes deleted and ${r.notes.edited} edited in The Network stay as they are`);
  for (const w of [...new Set(r.warnings)].slice(0, 20)) console.log(`  ! ${w}`);
  const out = join(ctx.runDir, `commit-${r.dryRun ? "dry-" : ""}${r.commitId}.json`);
  writeFileSync(out, JSON.stringify(r, null, 2));
  console.log(`→ ${out}`);
  return r.people.failed.length || r.notes.failed.length ? 1 : 0;
});
