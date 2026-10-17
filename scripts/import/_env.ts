/**
 * Shared bootstrap for every `scripts/import/*` command.
 *
 *   --env <file>     env file to load (default .env.local); its values override the shell
 *   --yes-prod       allow a non-local DATABASE_URL host (otherwise the script refuses)
 *   --write          perform writes (every write-capable script is a dry run without it)
 *   --owner <email>  owner profile (default: the only profile in the database)
 *   --source <s>     import source (default apple-notes)
 *   --run <id>       run id for artifacts under .cache/import/<run>/ (default: today's date)
 *
 * Import order matters: call `bootstrap()` before dynamically importing anything that touches
 * `@/lib/db` (the connection is created from process.env at import time).
 */
import { config } from "dotenv";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "host.docker.internal"]);

/** Main checkout root (artifacts live in its gitignored .cache even when run from a worktree). */
export function mainRoot() {
  const here = dirname(fileURLToPath(import.meta.url));
  const repo = resolve(here, "../..");
  const m = repo.match(/^(.*)\/\.claude\/worktrees\/[^/]+$/);
  return m ? m[1]! : repo;
}

export type Args = {
  argv: string[];
  flag: (name: string) => boolean;
  opt: (name: string, fallback?: string) => string | undefined;
  opts: (name: string) => string[];
  positionals: string[];
};

export function parseArgs(argv = process.argv.slice(2)): Args {
  const valueFlags = new Set<string>();
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      if (a.includes("=")) continue;
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--") && !BOOLEAN_FLAGS.has(a)) {
        valueFlags.add(a);
        i++;
      }
    } else positionals.push(a);
  }
  const get = (name: string) => {
    const out: string[] = [];
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i]!;
      if (a === name && valueFlags.has(name)) out.push(argv[i + 1]!);
      else if (a.startsWith(name + "=")) out.push(a.slice(name.length + 1));
    }
    return out;
  };
  return {
    argv,
    flag: (name) => argv.includes(name),
    opt: (name, fallback) => get(name).at(-1) ?? fallback,
    opts: (name) => get(name).flatMap((v) => v.split(",")).filter(Boolean),
    positionals,
  };
}

/** Flags that never take a value (so a following positional is not swallowed). */
const BOOLEAN_FLAGS = new Set([
  "--write", "--yes-prod", "--dry-run", "--force", "--all", "--json", "--allow-paid", "--include-decided",
  "--retry-failed", "--rescreen", "--no-rescreen", "--emit", "--requeue-truncated", "--list", "--target-local", "--quiet", "--no-ai", "--verbose", "--fail-fast", "--keep",
]);

export type Ctx = {
  args: Args;
  write: boolean;
  source: string;
  runId: string;
  runDir: string;
  root: string;
  dbHost: string;
  isLocal: boolean;
};

export function bootstrap(opts: { needsDb?: boolean; writes?: boolean } = {}): Ctx {
  const args = parseArgs();
  const root = process.cwd();
  const envFile = args.opt("--env", ".env.local")!;
  const envPath = resolve(root, envFile);
  if (!existsSync(envPath)) throw new Error(`env file not found: ${envPath}`);
  config({ path: envPath, override: true, quiet: true });

  let dbHost = "-";
  let isLocal = true;
  if (opts.needsDb !== false) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error(`DATABASE_URL missing in ${envFile}`);
    dbHost = new URL(url).hostname;
    isLocal = LOCAL_HOSTS.has(dbHost);
    if (!isLocal && !args.flag("--yes-prod")) {
      console.error(`Refusing to run against non-local database host "${dbHost}" (from ${envFile}). Pass --yes-prod if this is intended.`);
      process.exit(3);
    }
  }
  const write = !!opts.writes && args.flag("--write") && !args.flag("--dry-run");
  const source = args.opt("--source", "apple-notes")!;
  const runId = args.opt("--run", new Date().toISOString().slice(0, 10))!;
  const runDir = join(mainRoot(), ".cache", "import", runId);
  mkdirSync(runDir, { recursive: true });
  console.error(
    `· env ${envFile} · db ${dbHost}${isLocal ? " (local)" : " (REMOTE)"}${opts.writes ? (write ? " · WRITE" : " · dry run (pass --write to apply)") : ""} · source ${source} · run ${runId}`,
  );
  return { args, write, source, runId, runDir, root, dbHost, isLocal };
}

/** Resolves the owner profile id: --owner <email>, else the single profile in the database. */
export async function resolveOwner(ctx: Ctx): Promise<{ id: string; email: string }> {
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const email = ctx.args.opt("--owner");
  const rows = (await db.execute(
    email ? sql`select id, email from profiles where lower(email) = lower(${email})` : sql`select id, email from profiles order by created_at`,
  )) as unknown as { id: string; email: string }[];
  if (!rows.length) throw new Error(email ? `No profile for ${email}` : "No profile found");
  if (!email && rows.length > 1) throw new Error(`Several profiles exist (${rows.map((r) => r.email).join(", ")}); pass --owner <email>`);
  console.error(`· owner ${rows[0]!.email}`);
  return rows[0]!;
}

export function die(msg: string, code = 1): never {
  console.error(msg);
  process.exit(code);
}

/** Runs main, prints errors, closes the process (postgres-js keeps the event loop alive). */
export function run(main: () => Promise<number | void>) {
  main()
    .then((code) => process.exit(typeof code === "number" ? code : 0))
    .catch((e: unknown) => {
      console.error("FAILED:", e instanceof Error ? (process.env.DEBUG ? e.stack : e.message) : e);
      process.exit(1);
    });
}
