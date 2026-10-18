/** Loading stage files and running validation with DB-backed lookups. */
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { Ctx } from "./_env";

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Resolves a stage file path: absolute, relative to cwd, or relative to the run directory. */
export function stageFile(ctx: Ctx, p: string) {
  for (const c of [resolve(p), join(ctx.runDir, p)]) if (existsSync(c)) return c;
  throw new Error(`file not found: ${p} (also looked in ${ctx.runDir})`);
}

export async function validateStageFile(ctx: Ctx, stage: "resolve" | "filing", path: string, ownerId: string) {
  const { validateResolution, validateFiling } = await import("@/lib/import/validate");
  const raw = readJson(path) as { packetId?: string };
  const packetDir = stage === "resolve" ? "packets" : "filing";
  const packetPath = join(ctx.runDir, packetDir, `${raw.packetId ?? basename(path, ".json")}.json`);
  if (!existsSync(packetPath)) return { ok: false, errors: [`packet not found: ${packetPath}`], warnings: [] as string[], data: null, path, packet: null as unknown };
  const packet = readJson(packetPath);
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  if (stage === "resolve") {
    const ids = ((raw as { people?: { existingPersonId?: string | null }[] }).people ?? []).map((p) => p.existingPersonId).filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x));
    const found = ids.length
      ? new Set(((await db.execute(sql`select id::text from people where owner_id = ${ownerId} and deleted_at is null and id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`)) as unknown as { id: string }[]).map((r) => r.id))
      : new Set<string>();
    return { ...validateResolution(raw, packet, (id) => found.has(id)), path, packet };
  }
  const itemIds = ((packet as { items?: { itemId: string }[] }).items ?? []).map((i) => i.itemId);
  const texts = new Map(
    itemIds.length
      ? ((await db.execute(sql`select id::text, text from import_items where owner_id = ${ownerId} and id in (${sql.join(itemIds.map((i) => sql`${i}::uuid`), sql`, `)})`)) as unknown as { id: string; text: string }[]).map((r) => [r.id, r.text])
      : [],
  );
  return { ...validateFiling(raw, packet, (id) => texts.get(id) ?? null), path, packet };
}

export function printValidation(v: { ok: boolean; errors: string[]; warnings: string[]; path: string }) {
  console.log(`${v.ok ? "✓" : "✗"} ${v.path}`);
  for (const e of v.errors.slice(0, 50)) console.log(`  error: ${e}`);
  if (v.errors.length > 50) console.log(`  … ${v.errors.length - 50} more errors`);
  for (const w of v.warnings.slice(0, 30)) console.log(`  warning: ${w}`);
}
