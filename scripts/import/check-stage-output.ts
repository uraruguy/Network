/**
 * Offline check of a subagent's screen/extract output against its input batch (no database).
 *   pnpm tsx scripts/import/check-stage-output.ts --stage screen|extract <input bNN.json> <output bNN.json>
 * Validates the zod contract, that every input id appears exactly once, and (extract) that
 * excerpts are verbatim substrings of the note. Exit 1 on any error.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import { ExtractionV2Model, ScreenResult, formatIssues } from "@/lib/import/contracts";

const args = process.argv.slice(2);
const stageIdx = args.indexOf("--stage");
const stage = stageIdx >= 0 ? args.splice(stageIdx, 2)[1] : undefined;
const [inputPath, outputPath] = args;
if ((stage !== "screen" && stage !== "extract") || !inputPath || !outputPath) {
  console.error("usage: check-stage-output.ts --stage screen|extract <input.json> <output.json>");
  process.exit(1);
}

type InputItem = { id: string; text?: string };
const input = JSON.parse(readFileSync(inputPath, "utf8")) as { items: InputItem[] };
const raw = JSON.parse(readFileSync(outputPath, "utf8"));
const errors: string[] = [];

const schema =
  stage === "screen" ? ScreenResult : z.object({ items: z.array(z.object({ id: z.string(), extraction: ExtractionV2Model })) });
const parsed = schema.safeParse(raw);
if (!parsed.success) errors.push(...formatIssues(parsed.error));

const outItems = (raw?.items ?? []) as { id: string; extraction?: { candidates?: { name?: string; excerpt?: string | null }[] } }[];
const wanted = new Set(input.items.map((i) => i.id));
const seen = new Map<string, number>();
for (const item of outItems) seen.set(item.id, (seen.get(item.id) ?? 0) + 1);
for (const id of wanted) if (!seen.has(id)) errors.push(`missing id ${id}`);
for (const [id, n] of seen) {
  if (!wanted.has(id)) errors.push(`unknown id ${id}`);
  if (n > 1) errors.push(`id ${id} appears ${n} times`);
}

if (stage === "extract") {
  const normalise = (s: string) => s.replace(/\s+/g, " ").trim();
  const texts = new Map(input.items.map((i) => [i.id, normalise(i.text ?? "")]));
  for (const item of outItems) {
    for (const c of item.extraction?.candidates ?? []) {
      if (c.excerpt && !texts.get(item.id)?.includes(normalise(c.excerpt))) errors.push(`${item.id}: excerpt for "${c.name}" is not verbatim`);
    }
  }
}

if (errors.length) {
  console.error(`✗ ${outputPath}\n  ${errors.join("\n  ")}`);
  process.exit(1);
}
console.log(`✓ ${outputPath} (${outItems.length} items)`);
