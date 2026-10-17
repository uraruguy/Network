/**
 * Cross-packet reconciliation after all resolution files are applied. Dry run unless --write.
 *   pnpm tsx scripts/import/reconcile.ts --run <id> [--write]
 * Deletes proposals left without mentions, flags duplicates across packets (same name, same existing
 * person), checks introducedBy keys, counts unassigned mentions and re-runs the auto-decision policy.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { bootstrap, resolveOwner, run } from "./_env";

run(async () => {
  const ctx = bootstrap({ writes: true });
  const owner = await resolveOwner(ctx);
  const { db } = await import("@/lib/db");
  const { inTransaction } = await import("@/lib/data/import-shared");
  const { reconcile } = await import("@/lib/data/import-resolve");
  const report = await inTransaction(db, ctx.write, (tx) => reconcile(tx, owner.id, ctx.source));
  console.log(`deleted empty proposals: ${report.deletedEmpty}`);
  console.log(`duplicate-name groups:   ${report.duplicateGroups.length}${report.duplicateGroups.length ? "\n  " + report.duplicateGroups.map((g) => g.join(" = ")).join("\n  ") : ""}`);
  console.log(`same existing person:    ${report.sharedMatch.length}${report.sharedMatch.length ? "\n  " + report.sharedMatch.map((g) => g.join(" = ")).join("\n  ") : ""}`);
  console.log(`unknown introducers:     ${report.badIntroducers.length}${report.badIntroducers.length ? "\n  " + report.badIntroducers.join("\n  ") : ""}`);
  console.log(`unassigned mentions:     ${report.unassignedMentions}`);
  console.log(`policy:                  ${JSON.stringify(report.policy)}`);
  writeFileSync(join(ctx.runDir, `reconcile${ctx.write ? "" : ".dry"}.json`), JSON.stringify(report, null, 2));
  console.log(ctx.write ? "reconciled" : "dry run — rolled back (pass --write to apply)");
});
