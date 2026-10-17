/**
 * Runs SQL inside a READ ONLY transaction and prints the rows as JSON. Postgres rejects any write.
 *
 *   pnpm tsx scripts/db/readonly-query.ts [--env .env.cloud.local] <file.sql | "select …">
 *
 * Statements in a file are separated by blank-line-terminated semicolons; each result is printed in order.
 */
import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import postgres from "postgres";

const args = process.argv.slice(2);
const envIdx = args.indexOf("--env");
const envFile = envIdx >= 0 ? args.splice(envIdx, 2)[1] : ".env.local";
config({ path: envFile, override: true, quiet: true });

const input = args.join(" ").trim();
if (!input) {
  console.error('Usage: pnpm tsx scripts/db/readonly-query.ts [--env <file>] <file.sql | "select …">');
  process.exit(1);
}
const text = existsSync(input) ? readFileSync(input, "utf8") : input;
const statements = text
  .split(/;\s*(?:\n|$)/)
  .map((s) => s.trim())
  .filter(Boolean);

const url = process.env.DATABASE_URL;
if (!url) throw new Error(`DATABASE_URL missing in ${envFile}`);
console.error(`db: ${new URL(url).hostname} (read-only)`);

const sql = postgres(url, { prepare: false, max: 1 });
sql
  .begin("read only", async (tx) => {
    for (const statement of statements) {
      const rows = await tx.unsafe(statement);
      console.log(JSON.stringify(rows, null, 1));
    }
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
