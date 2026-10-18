/**
 * Restore a backup into the LOCAL database (rehearsal of a production import on real data).
 *   pnpm tsx scripts/import/restore-backup.ts <backupDir> --target local [--owner dev@local.test] [--write]
 *
 * The local owner's rows in every backed-up table are REPLACED (wiped, then inserted with
 * owner_id remapped to the local owner). Categories are matched by slug. Never runs remotely.
 * Without --write everything runs in a transaction that is rolled back.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bootstrap, die, resolveOwner, run } from "./_env";
import { BACKUP_TABLES } from "./_tables";

run(async () => {
  const ctx = bootstrap({ writes: true });
  if (ctx.args.opt("--target") !== "local") die("restore-backup only restores into the local database: pass --target local");
  if (!ctx.isLocal) die(`refusing: ${ctx.dbHost} is not a local database (restore never runs remotely)`, 3);
  const dir = ctx.args.positionals[0] ? resolve(ctx.args.positionals[0]) : die("usage: restore-backup.ts <backupDir> --target local [--write]");
  if (!existsSync(join(dir, "manifest.json"))) die(`not a backup directory: ${dir}`);
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { owner: { id: string; email: string }; counts: Record<string, number | "missing"> };
  const owner = await resolveOwner(ctx);
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const { inTransaction } = await import("@/lib/data/import-shared");

  const load = (t: string): Record<string, unknown>[] => (existsSync(join(dir, `${t}.json`)) ? JSON.parse(readFileSync(join(dir, `${t}.json`), "utf8")) : []);
  const result = await inTransaction(db, ctx.write, async (tx) => {
    const exists = async (t: string) => ((await tx.execute(sql`select to_regclass(${`public.${t}`}) is not null as ok`)) as unknown as { ok: boolean }[])[0]?.ok;
    const insertable = async (t: string) =>
      ((await tx.execute(sql`
        select column_name, is_identity = 'YES' and identity_generation = 'ALWAYS' as ident
        from information_schema.columns where table_schema = 'public' and table_name = ${t} and is_generated = 'NEVER'`)) as unknown as { column_name: string; ident: boolean }[]);

    // 1. Wipe the local owner's rows (reverse dependency order).
    const wiped: Record<string, number> = {};
    for (const t of [...BACKUP_TABLES].reverse()) {
      if (t === "categories" || !(await exists(t))) continue;
      const r = (await tx.execute(sql`delete from ${sql.identifier(t)} where owner_id = ${owner.id} returning 1`)) as unknown as unknown[];
      wiped[t] = r.length;
    }

    // 2. Categories: keep local rows, map backup ids by slug (create missing ones).
    const catMap = new Map<string, string>();
    for (const c of load("categories")) {
      const found = (await tx.execute(sql`select id from categories where owner_id = ${owner.id} and slug = ${String(c.slug)}`)) as unknown as { id: string }[];
      let id = found[0]?.id;
      if (!id) {
        const ins = (await tx.execute(
          sql`insert into categories (owner_id, name, slug, color, icon, sort) values (${owner.id}, ${String(c.name)}, ${String(c.slug)}, ${String(c.color)}, ${String(c.icon)}, ${Number(c.sort ?? 0)}) returning id`,
        )) as unknown as { id: string }[];
        id = ins[0]!.id;
      }
      catMap.set(String(c.id), id);
    }

    // 3. Insert everything else with owner_id remapped; self-references in a second pass.
    const restored: Record<string, number> = {};
    for (const t of BACKUP_TABLES) {
      if (t === "categories" || !(await exists(t))) continue;
      let rows: Record<string, unknown>[] = load(t).map((r) => ({ ...r, owner_id: owner.id }));
      if (!rows.length) continue;
      if (t === "person_categories") rows = rows.flatMap((r) => (catMap.has(String(r.category_id)) ? [{ ...r, category_id: catMap.get(String(r.category_id)) }] : []));
      const deferred: { id: unknown; col: string; value: unknown }[] = [];
      const selfRef = t === "people" ? "introduced_by_id" : t === "import_people" ? "merged_into_id" : null;
      if (selfRef) rows = rows.map((r) => (r[selfRef] ? (deferred.push({ id: r.id, col: selfRef, value: r[selfRef] }), { ...r, [selfRef]: null }) : r));
      const cols = await insertable(t);
      const names = cols.map((c) => c.column_name).filter((c) => c in rows[0]!);
      const ident = cols.some((c) => c.ident && names.includes(c.column_name));
      const colList = sql.join(names.map((n) => sql.identifier(n)), sql`, `);
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = JSON.stringify(rows.slice(i, i + 500));
        await tx.execute(
          sql`insert into ${sql.identifier(t)} (${colList}) ${ident ? sql`overriding system value` : sql``} select ${colList} from jsonb_populate_recordset(null::${sql.identifier(t)}, ${chunk}::jsonb)`,
        );
      }
      for (const d of deferred) await tx.execute(sql`update ${sql.identifier(t)} set ${sql.identifier(d.col)} = ${String(d.value)}::uuid where id = ${String(d.id)}::uuid`);
      restored[t] = rows.length;
    }
    if (await exists("import_commit_log")) await tx.execute(sql`select setval(pg_get_serial_sequence('import_commit_log', 'id'), coalesce((select max(id) from import_commit_log), 1))`);
    return { wiped, restored };
  });
  console.log(`backup of ${manifest.owner.email} → local owner ${owner.email}`);
  console.log(JSON.stringify(result, null, 2));
  if (!ctx.write) console.log("dry run — rolled back (pass --write to restore)");
});
