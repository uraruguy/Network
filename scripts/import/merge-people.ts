/**
 * Merges a duplicate person into another one (e.g. two cards the import made for one person).
 *   pnpm tsx scripts/import/merge-people.ts --from <duplicate personId> --into <kept personId> [--write]
 * Dry run unless --write (one transaction, rolled back). See mergePeople() for what moves.
 * Take a backup first (backup.ts); the merge is recorded in audit_log as person.merge.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { bootstrap, die, resolveOwner, run } from "./_env";

run(async () => {
  const ctx = bootstrap({ writes: true });
  const owner = await resolveOwner(ctx);
  const usage = "usage: merge-people.ts --from <duplicate personId> --into <kept personId> [--write]";
  const drop = ctx.args.opt("--from") ?? die(usage);
  const keep = ctx.args.opt("--into") ?? die(usage);
  const { db } = await import("@/lib/db");
  const { mergePeople } = await import("@/lib/data/people-merge");
  const { recordAudit } = await import("@/lib/data/audit");
  const r = await mergePeople(db, owner.id, keep, drop, { write: ctx.write });
  if (ctx.write) await recordAudit({ ownerId: owner.id, actor: "cli", action: "person.merge", entity: "person", entityId: keep, meta: { drop: r.drop, fields: r.fields, moved: r.moved } });
  console.log(`merge “${r.drop.name}” → “${r.keep.name}”${r.dryRun ? " (DRY RUN — rolled back)" : ""}`);
  console.log(`fields filled: ${r.fields.join(", ") || "none"} · key facts merged: ${r.factsMerged ? "yes" : "no"}`);
  console.log(`moved: ${Object.entries(r.moved).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  writeFileSync(join(ctx.runDir, `merge-${r.dryRun ? "dry-" : ""}${drop}.json`), JSON.stringify(r, null, 2));
});
