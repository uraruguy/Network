/**
 * Validates subagent output (read-only).
 *   pnpm tsx scripts/import/validate.ts --run <id> --stage resolve resolutions/r01.json [more…]
 *   pnpm tsx scripts/import/validate.ts --run <id> --stage filing filing-out/f01.json
 * Exit 1 when any file has errors.
 */
import { bootstrap, die, resolveOwner, run } from "./_env";
import { printValidation, stageFile, validateStageFile } from "./_files";

run(async () => {
  const ctx = bootstrap();
  const stage = ctx.args.opt("--stage");
  if (stage !== "resolve" && stage !== "filing") die("usage: validate.ts --stage resolve|filing <file…>");
  if (!ctx.args.positionals.length) die("no files given");
  const owner = await resolveOwner(ctx);
  let bad = 0;
  for (const p of ctx.args.positionals) {
    const v = await validateStageFile(ctx, stage, stageFile(ctx, p), owner.id);
    printValidation(v);
    if (!v.ok) bad++;
  }
  return bad ? 1 : 0;
});
