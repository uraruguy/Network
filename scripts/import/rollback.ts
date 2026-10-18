/**
 * Rolls back import commits using import_commit_log (reverse order, one transaction).
 *   pnpm tsx scripts/import/rollback.ts --list
 *   pnpm tsx scripts/import/rollback.ts --commit <commitId> [--write] [--force]
 *   pnpm tsx scripts/import/rollback.ts --all [--source apple-notes] [--write] [--force]
 * Dry run unless --write. Refuses to delete imported people you have built on since (notes,
 * reminders, tags, categories, activities, mentions, people they introduced, chat threads the import
 * did not create) unless --force. Locations, tags and activities still in use are kept.
 */
import { bootstrap, die, resolveOwner, run } from "./_env";

run(async () => {
  const ctx = bootstrap({ writes: true });
  const owner = await resolveOwner(ctx);
  const { db } = await import("@/lib/db");
  const { listCommits, rollbackImport } = await import("@/lib/data/import-commit");
  if (ctx.args.flag("--list")) {
    const rows = await listCommits(db, owner.id, ctx.source);
    if (!rows.length) console.log("no commits");
    for (const r of rows) console.log(`${r.commit_id}  ${new Date(r.at).toISOString()}  ops ${r.ops}  people +${r.people_created}  notes +${r.notes_created}`);
    return;
  }
  const commitId = ctx.args.opt("--commit");
  if (!commitId && !ctx.args.flag("--all")) die("usage: rollback.ts --commit <id> | --all [--source s] [--write] [--force] | --list");
  const r = await rollbackImport(db, owner.id, { commitId, source: commitId ? undefined : ctx.source, dryRun: !ctx.write, force: ctx.args.flag("--force") });
  console.log(`commits: ${r.commits.join(", ") || "(none)"}`);
  for (const [k, v] of Object.entries(r.reverted).sort()) console.log(`  reverted ${k.padEnd(26)} ${v}`);
  for (const [k, v] of Object.entries(r.kept).sort()) console.log(`  kept     ${`${k} (still in use)`.padEnd(26)} ${v}`);
  console.log(`  people recomputed (last_interaction_at, next_followup_at): ${r.peopleRecomputed}`);
  console.log(ctx.write ? "rolled back" : "dry run — nothing changed (pass --write to roll back)");
});
