/**
 * AI stages on the Claude subscription (agent-sdk, $0 by default).
 *   pnpm tsx scripts/import/run-stage.ts --stage screen  [--limit 600] [--no-rescreen] [--write]
 *   pnpm tsx scripts/import/run-stage.ts --stage extract [--limit 400] [--concurrency 3] [--write]
 * Options: --provider agent-sdk|anthropic|openrouter (paid ones need --allow-paid), --model opus,
 *          --fast-model sonnet, --retry-failed (requeue failed items first), --ids a,b (only these items),
 *          --requeue-truncated (extract: re-extract v1 notes longer than 12k chars, which v1 truncated).
 * Without --write it only lists what would be processed. Resumable: work is selected by status, and
 * a rate/usage limit stops the run cleanly (exit 2) — just run it again later.
 *
 * Subagent fallback (no SDK call at all):
 *   --emit               write the pending work as batch files + BRIEF-<stage>.md for Claude subagents
 *                        → .cache/import/<run>/stage-<stage>/bNN.json
 *   --from <file> --write  apply a subagent's results file
 *                        screen:  {"items":[ScreenItem…]}   extract: {"items":[{"id":…,"extraction":ExtractionV2}…]}
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { bootstrap, die, resolveOwner, run } from "./_env";
import { isRateLimit, prepareAi } from "./_ai";

run(async () => {
  const ctx = bootstrap({ writes: true });
  const stage = ctx.args.opt("--stage");
  if (stage !== "screen" && stage !== "extract") die("usage: run-stage.ts --stage screen|extract [--write]");
  const fromFile = ctx.args.opt("--from");
  const emit = ctx.args.flag("--emit");
  const provider = fromFile || emit ? "file" : prepareAi(ctx.args);
  const owner = await resolveOwner(ctx);
  const { db } = await import("@/lib/db");
  const st = await import("@/lib/data/import-stage");
  const { z } = await import("zod");
  const { ScreenResult, ExtractionV2, formatIssues } = await import("@/lib/import/contracts");
  const ids = ctx.args.opts("--ids");
  const limit = Number(ctx.args.opt("--limit", "1000"));
  if (ctx.args.flag("--retry-failed") && ctx.write) console.log(`requeued ${await st.requeueFailed(db, owner.id, ctx.source)} failed items`);
  if (stage === "extract" && ctx.args.flag("--requeue-truncated") && ctx.write) {
    const r = await st.requeueTruncated(db, owner.id, ctx.source);
    console.log(`requeued ${r.length} truncated v1 extractions: ${r.map((x) => x.title).join(", ")}`);
  }
  console.log("before:", await st.stageCounts(db, owner.id, ctx.source));
  const log: Record<string, unknown>[] = [];
  let stoppedByLimit = false;

  const readResults = <T>(schema: { safeParse: (x: unknown) => { success: true; data: T } | { success: false; error: import("zod").ZodError } }) => {
    const p = schema.safeParse(JSON.parse(readFileSync(resolve(fromFile!), "utf8")));
    if (!p.success) die(`invalid ${stage} results file ${fromFile}:\n  ${formatIssues(p.error).join("\n  ")}`);
    return p.data;
  };
  const emitBatches = async (items: { id: string }[], size: number, brief: string) => {
    const dir = join(ctx.runDir, `stage-${stage}`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(ctx.runDir, `stage-${stage}-out`), { recursive: true });
    let n = 0;
    for (let i = 0; i < items.length; i += size) writeFileSync(join(dir, `b${String(++n).padStart(2, "0")}.json`), JSON.stringify({ stage, items: items.slice(i, i + size) }, null, 1));
    writeFileSync(join(ctx.runDir, `BRIEF-${stage}.md`), brief.replace("{{BATCHES}}", String(n)));
    console.log(`→ ${n} batch files in ${dir} · brief ${join(ctx.runDir, `BRIEF-${stage}.md`)}`);
  };
  const { IMPORT_SYSTEM } = await import("@/lib/ai/prompts/system");

  if (stage === "screen") {
    const { SCREEN_BATCH, SCREEN_MAX_CHARS, screenPrompt } = await import("@/lib/ai/prompts/screen");
    const { isPersonFolder } = await import("@/lib/import/folders");
    let items = await st.itemsToScreen(db, owner.id, ctx.source, { limit, rescreen: !ctx.args.flag("--no-rescreen"), ids });
    const fileItems = fromFile ? readResults(ScreenResult).items : null;
    if (fileItems) items = items.filter((i) => fileItems.some((r) => r.id === i.id));
    console.log(`${items.length} notes to screen (${items.filter((i) => i.status === "skipped").length} re-screens of head-700 skips)`);
    if (emit) {
      const brief = `# Screen notes — run ${ctx.runId}\n\n${IMPORT_SYSTEM}\n\nFor each batch file \`stage-screen/bNN.json\` ({{BATCHES}} files) write \`stage-screen-out/bNN.json\` = {"items":[{"id","kind","confidence","peopleHint":[],"reason"}]} (one item per note), then apply with\n\`pnpm tsx scripts/import/run-stage.ts --run ${ctx.runId} --stage screen --from <file> --write\`.\n\n${screenPrompt([])}\n`;
      await emitBatches(items.map((i) => ({ id: i.id, title: i.title, folders: i.folders, text: i.text.slice(0, SCREEN_MAX_CHARS) })), SCREEN_BATCH, brief);
      return;
    }
    if (!ctx.write) {
      for (const it of items.slice(0, 40)) console.log(`  · ${it.title ?? "(untitled)"} [${it.folders.join(", ")}]${it.status === "skipped" ? " (re-screen)" : ""}`);
      return;
    }
    const { screenBatch } = await import("@/lib/ai/import");
    const model = fileItems ? basename(fromFile!) : (process.env.AI_MODEL_FAST ?? (provider === "agent-sdk" ? "sonnet" : "default"));
    const screenedWith = fileItems ? `full8k:file:${model}` : `full8k:${provider}:${model}`;
    const counts: Record<string, number> = {};
    for (let i = 0; i < items.length; i += SCREEN_BATCH) {
      const batch = items.slice(i, i + SCREEN_BATCH);
      try {
        const results = fileItems ?? (await screenBatch(batch.map((b) => ({ id: b.id, title: b.title, text: b.text, folders: b.folders }))));
        const byId = new Map(results.map((r) => [r.id, r]));
        for (const it of batch) {
          const r = byId.get(it.id);
          if (!r) {
            counts.missing = (counts.missing ?? 0) + 1;
            continue; // stays pending → picked up by the next run
          }
          const personFolder = it.folders.find((f) => isPersonFolder(f));
          const override = r.kind === "not_people" && personFolder ? { kind: "person" as const, why: `person-named folder “${personFolder}”` } : undefined;
          const s = await st.applyScreen(db, it, r, screenedWith, override);
          counts[s.kind] = (counts[s.kind] ?? 0) + 1;
          if (s.rescued) counts.rescued = (counts.rescued ?? 0) + 1;
          log.push({ id: it.id, title: it.title, ...s });
        }
      } catch (e) {
        if (isRateLimit(e)) {
          console.error(`\nrate/usage limit: ${(e as Error).message}\nstopping — rerun later to resume`);
          stoppedByLimit = true;
          break;
        }
        console.error(`\nbatch failed (${(e as Error).message}); marking ${batch.length} items failed`);
        for (const it of batch) await st.markFailed(db, it.id, `screen: ${(e as Error).message}`);
        counts.failed = (counts.failed ?? 0) + batch.length;
      }
      process.stdout.write(`\rscreened ${Math.min(i + SCREEN_BATCH, items.length)}/${items.length} ${JSON.stringify(counts)}   `);
    }
    console.log();
  } else {
    const { isJournalFolder } = await import("@/lib/import/folders");
    const { extractPrompt } = await import("@/lib/ai/prompts/extract");
    let items = await st.itemsToExtract(db, owner.id, ctx.source, { limit, ids });
    const fileItems = fromFile ? readResults(z.object({ items: z.array(z.object({ id: z.string(), extraction: ExtractionV2 })) })).items : null;
    if (fileItems) items = items.filter((i) => fileItems.some((r) => r.id === i.id));
    console.log(`${items.length} notes to extract (${items.filter((i) => i.text.length > 12000).length} longer than 12k chars → chunked)`);
    const modeOf = (it: (typeof items)[number]): "journal" | "full" => (it.classification === "journal" || isJournalFolder(it.folders) ? "journal" : "full");
    if (emit) {
      const rules = extractPrompt({ title: "<title>", text: "", created: "<created>", folders: [], existingNames: [], mode: "full" }).split("Note created:")[0];
      const brief = `# Extract people — run ${ctx.runId}\n\n${IMPORT_SYSTEM}\n\nFor each batch file \`stage-extract/bNN.json\` ({{BATCHES}} files) write \`stage-extract-out/bNN.json\` = {"items":[{"id","extraction":{"noteSummary","suggestedTitle","occurredAt","candidates":[…]}}]} (ExtractionV2, see src/lib/import/contracts.ts), then apply with\n\`pnpm tsx scripts/import/run-stage.ts --run ${ctx.runId} --stage extract --from <file> --write\`.\nItems with \`mode: "journal"\`: only named people with something memorable, ≤3 key facts, verbatim excerpt.\n\n${rules}\n`;
      await emitBatches(items.map((i) => ({ id: i.id, title: i.title, folders: i.folders, created: i.externalCreatedAt?.toISOString() ?? null, mode: modeOf(i), text: i.text })), 5, brief);
      return;
    }
    if (!ctx.write) {
      for (const it of items.slice(0, 40)) console.log(`  · ${it.title ?? "(untitled)"} [${it.classification}] ${it.text.length} chars`);
      return;
    }
    const { extractNoteV2 } = await import("@/lib/ai/import");
    const names = await st.existingPeopleNames(db, owner.id);
    const concurrency = Math.max(1, Number(ctx.args.opt("--concurrency", "3")));
    let next = 0;
    let done = 0;
    const counts: Record<string, number> = { extracted: 0, failed: 0, candidates: 0 };
    const worker = async () => {
      while (!stoppedByLimit && next < items.length) {
        const it = items[next++]!;
        const mode = modeOf(it);
        try {
          const fromResults = fileItems?.find((r) => r.id === it.id)?.extraction;
          const ex = fromResults ? { ...fromResults, mode } : await extractNoteV2({ title: it.title, text: it.text, created: it.externalCreatedAt?.toISOString() ?? null, folders: it.folders, existingNames: names, mode });
          await st.applyExtraction(db, it.id, ex);
          counts.extracted!++;
          counts.candidates! += ex.candidates.length;
          log.push({ id: it.id, title: it.title, mode, chunks: ex.chunks, candidates: ex.candidates.map((c) => c.name) });
        } catch (e) {
          if (isRateLimit(e)) {
            stoppedByLimit = true;
            console.error(`\nrate/usage limit: ${(e as Error).message}\nstopping — rerun later to resume`);
            return;
          }
          await st.markFailed(db, it.id, `extract: ${(e as Error).message}`);
          counts.failed!++;
        }
        done++;
        process.stdout.write(`\rextracted ${done}/${items.length} ${JSON.stringify(counts)}   `);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    console.log();
  }
  console.log("after:", await st.stageCounts(db, owner.id, ctx.source));
  const out = join(ctx.runDir, `stage-${stage}-${Date.now()}.json`);
  writeFileSync(out, JSON.stringify({ stage, provider, stoppedByLimit, items: log }, null, 2));
  console.log(`→ ${out}`);
  return stoppedByLimit ? 2 : 0;
});
