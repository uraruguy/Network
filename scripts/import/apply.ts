/**
 * Applies validated subagent output to import_people / import_mentions. Dry run unless --write.
 *   pnpm tsx scripts/import/apply.ts --run <id> --stage resolve [resolutions/*.json …] [--write]
 *   pnpm tsx scripts/import/apply.ts --run <id> --stage filing  [filing-out/*.json …] [--write]
 * With no files, every file in resolutions/ (or filing-out/) of the run is applied.
 * Never overwrites proposals decided by Jakob (decided_by = 'user') or already committed.
 */
import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { bootstrap, die, resolveOwner, run } from "./_env";
import { printValidation, stageFile, validateStageFile } from "./_files";

run(async () => {
  const ctx = bootstrap({ writes: true });
  const stage = ctx.args.opt("--stage");
  if (stage !== "resolve" && stage !== "filing") die("usage: apply.ts --stage resolve|filing [files…] [--write]");
  const owner = await resolveOwner(ctx);
  const dirName = stage === "resolve" ? "resolutions" : "filing-out";
  const files = ctx.args.positionals.length
    ? ctx.args.positionals.map((p) => stageFile(ctx, p))
    : existsSync(join(ctx.runDir, dirName))
      ? readdirSync(join(ctx.runDir, dirName)).filter((f) => f.endsWith(".json")).sort().map((f) => join(ctx.runDir, dirName, f))
      : [];
  if (!files.length) die(`no ${dirName} files to apply`);

  const validated: Awaited<ReturnType<typeof validateStageFile>>[] = [];
  for (const f of files) {
    const v = await validateStageFile(ctx, stage, f, owner.id);
    if (!v.ok) {
      printValidation(v);
      die(`refusing to apply: ${f} is invalid (run validate.ts)`);
    }
    validated.push(v);
  }

  const { db } = await import("@/lib/db");
  const { inTransaction } = await import("@/lib/data/import-shared");
  const res = await import("@/lib/data/import-resolve");
  const { reviewStats } = await import("@/lib/data/import-review");
  const summary = await inTransaction(db, ctx.write, async (tx) => {
    const out: Record<string, unknown> = {};
    for (const v of validated) {
      if (stage === "resolve") {
        out[basename(v.path)] = await res.applyResolution(tx, owner.id, ctx.source, v.data as never, v.packet as never, basename(v.path));
      } else {
        out[basename(v.path)] = await res.applyFilingFile(tx, owner.id, ctx.source, v.data as never);
      }
    }
    out.stats = await reviewStats(tx, owner.id, ctx.source);
    return out;
  });
  console.log(JSON.stringify(summary, null, 2));
  console.log(ctx.write ? "applied" : "dry run — rolled back (pass --write to apply)");
});
