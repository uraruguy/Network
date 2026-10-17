/**
 * JSON backup of everything an import can touch, for the owner (read-only).
 *   pnpm tsx scripts/import/backup.ts [--env .env.local] [--owner email] [--yes-prod]
 * → .cache/backups/<iso>/<table>.json + manifest.json (row counts)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bootstrap, mainRoot, resolveOwner, run } from "./_env";
import { BACKUP_TABLES } from "./_tables";


run(async () => {
  const ctx = bootstrap();
  const owner = await resolveOwner(ctx);
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(mainRoot(), ".cache", "backups", stamp);
  mkdirSync(dir, { recursive: true });
  const counts: Record<string, number | "missing"> = {};
  for (const t of BACKUP_TABLES) {
    const exists = (await db.execute(sql`select to_regclass(${`public.${t}`}) is not null as ok`)) as unknown as { ok: boolean }[];
    if (!exists[0]?.ok) {
      counts[t] = "missing";
      continue;
    }
    const rows = (await db.execute(
      sql`select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as rows from ${sql.identifier(t)} t where t.owner_id = ${owner.id}`,
    )) as unknown as { rows: Record<string, unknown>[] }[];
    const data = rows[0]?.rows ?? [];
    writeFileSync(join(dir, `${t}.json`), JSON.stringify(data));
    counts[t] = data.length;
  }
  const manifest = { createdAt: new Date().toISOString(), dbHost: ctx.dbHost, owner, counts };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(counts, null, 2));
  console.log(`backup → ${dir}`);
});
