/**
 * First-run setup for local development and self-hosting. Safe to run again at any time.
 *
 *   pnpm bootstrap                                  # .env.local (+ owner account on a local Supabase)
 *   pnpm bootstrap --env /tmp/scratch.env           # any other env file
 *   pnpm bootstrap --email you@example.com --password-stdin < pw.txt   # no questions asked
 *
 * 1. Generates APP_SECRET, CRON_SECRET and INBOX_TOKEN when they are missing or empty.
 * 2. With a local stack running (`supabase start`), fills NEXT_PUBLIC_SUPABASE_URL,
 *    NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL and NEXT_PUBLIC_APP_URL.
 * 3. Writes them into the env file. Existing values are never changed: new keys are appended under a
 *    comment, empty `KEY=` lines are filled in place. Only key names are printed, never values.
 * 4. Creates the single owner account through the Supabase Admin API, but only when the Supabase URL
 *    is local (127.0.0.1 / localhost) and no user exists yet. For a cloud project, add the user in the
 *    Supabase dashboard instead (Authentication → Users → Add user, auto-confirm).
 *
 * Options:
 *   --env <path>        env file to create or merge into (default .env.local)
 *   --email <address>   owner e-mail (otherwise asked for when running in a terminal)
 *   --password-stdin    read the owner password from stdin (never pass passwords as arguments)
 *   --no-owner          don't create the owner account
 *   --no-supabase       don't ask the Supabase CLI for local URLs and keys
 *   --dry-run           show what would change, write nothing
 *   --yes, -y           never prompt (the owner is created only with --email and --password-stdin)
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";
import { passwordProblem } from "../src/lib/security/password";

/* ------------------------------------------------------------------ */
/*  Env file parsing and merging (pure, unit-tested)                    */
/* ------------------------------------------------------------------ */

export type EnvLine = { kind: "entry"; key: string; value: string; raw: string } | { kind: "other"; raw: string };

const ENTRY = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

/** The value as dotenv reads it: quotes removed, inline ` # comment` dropped from unquoted values. */
export function unquote(rawValue: string): string {
  const v = rawValue.trim();
  const q = v[0];
  if ((q === '"' || q === "'" || q === "`") && v.length >= 2) {
    const end = v.indexOf(q, 1);
    if (end > 0) return v.slice(1, end);
  }
  const hash = v.search(/\s#/);
  return (hash >= 0 ? v.slice(0, hash) : v).trim();
}

/** Splits an env file into entries and everything else (comments, blanks), keeping each raw line. */
export function parseEnvFile(text: string): EnvLine[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines.map((raw) => {
    const m = ENTRY.exec(raw);
    return m ? { kind: "entry", key: m[1]!, value: unquote(m[2]!), raw } : { kind: "other", raw };
  });
}

/** Key → value, last occurrence wins (as in dotenv). Commented-out keys don't count. */
export function envValues(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of parseEnvFile(text)) if (line.kind === "entry") out.set(line.key, line.value);
  return out;
}

/** `KEY=value`, quoted when the value contains anything dotenv would misread. */
export function formatEntry(key: string, value: string): string {
  return /^[A-Za-z0-9_\-.:/@+=,%~]*$/.test(value) ? `${key}=${value}` : `${key}="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export type MergeResult = {
  text: string;
  /** Keys appended to the end of the file. */
  added: string[];
  /** Keys whose empty `KEY=` line was filled in place. */
  filled: string[];
  /** Keys that already had a value (left untouched). */
  kept: string[];
};

/**
 * Merges `additions` into an env file without ever changing an existing value. A key counts as
 * present when its last occurrence has a non-empty value; an empty last occurrence is filled in
 * place; missing keys are appended in one block under `header`. Running it twice is a no-op.
 */
export function mergeEnv(text: string, additions: Record<string, string>, header = "# Added by pnpm bootstrap"): MergeResult {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = parseEnvFile(text);
  const lastIndex = new Map<string, number>();
  lines.forEach((l, i) => l.kind === "entry" && lastIndex.set(l.key, i));

  const added: string[] = [];
  const filled: string[] = [];
  const kept: string[] = [];
  const out = lines.map((l) => l.raw);
  for (const [key, value] of Object.entries(additions)) {
    const i = lastIndex.get(key);
    const line = i === undefined ? undefined : lines[i];
    if (line?.kind === "entry" && line.value !== "") kept.push(key);
    else if (i !== undefined) {
      out[i] = formatEntry(key, value);
      filled.push(key);
    } else added.push(key);
  }
  if (added.length) {
    if (out.length && out.at(-1)!.trim() !== "") out.push("");
    out.push(header, ...added.map((k) => formatEntry(k, additions[k]!)));
  }
  const changed = added.length + filled.length > 0;
  return { text: changed ? out.join(eol) + eol : text, added, filled, kept };
}

/* ------------------------------------------------------------------ */
/*  What to add (pure, unit-tested)                                     */
/* ------------------------------------------------------------------ */

/** Secrets the app needs. Same strength as `openssl rand -base64 48` / `openssl rand -hex 24`. */
export const SECRET_SPECS = {
  APP_SECRET: { minLength: 32, make: (rand: (n: number) => Buffer) => rand(48).toString("base64url") },
  CRON_SECRET: { minLength: 16, make: (rand: (n: number) => Buffer) => rand(24).toString("hex") },
  INBOX_TOKEN: { minLength: 16, make: (rand: (n: number) => Buffer) => rand(24).toString("hex") },
} as const;

/** Fresh values for every secret that is missing or empty in `existing`. */
export function missingSecrets(existing: Map<string, string>, rand: (n: number) => Buffer = randomBytes): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, spec] of Object.entries(SECRET_SPECS)) if (!existing.get(key)) out[key] = spec.make(rand);
  return out;
}

/** Secrets that are set but too short to pass validation (names only). */
export function weakSecrets(existing: Map<string, string>): string[] {
  return Object.entries(SECRET_SPECS)
    .filter(([key, spec]) => {
      const v = existing.get(key);
      return !!v && v.length < spec.minLength;
    })
    .map(([key]) => key);
}

/** `supabase status -o json` output → object. Tolerates banners or warnings around the JSON. */
export function parseStatusJson(stdout: string): Record<string, string> | null {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(stdout.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string>) : null;
  } catch {
    return null;
  }
}

/** The app's variables from a local stack's status (legacy JWT keys preferred, new-style keys as fallback). */
export function supabaseEnvFromStatus(status: Record<string, string>): Record<string, string> {
  const pick = (...names: string[]) => names.map((n) => status[n]).find((v) => typeof v === "string" && v.length > 0);
  const out: Record<string, string> = {};
  const url = pick("API_URL");
  const anon = pick("ANON_KEY", "PUBLISHABLE_KEY");
  const service = pick("SERVICE_ROLE_KEY", "SECRET_KEY");
  const db = pick("DB_URL");
  if (url) out.NEXT_PUBLIC_SUPABASE_URL = url;
  if (anon) out.NEXT_PUBLIC_SUPABASE_ANON_KEY = anon;
  if (service) out.SUPABASE_SERVICE_ROLE_KEY = service;
  if (db) out.DATABASE_URL = db;
  return out;
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** True only for loopback URLs: the owner account is never created anywhere else. */
export function isLocalUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  CLI                                                                 */
/* ------------------------------------------------------------------ */

type Options = {
  envFile: string;
  email?: string;
  passwordStdin: boolean;
  owner: boolean;
  supabase: boolean;
  dryRun: boolean;
  yes: boolean;
};

export function parseOptions(argv: string[]): Options | "help" {
  const opts: Options = { envFile: ".env.local", passwordStdin: false, owner: true, supabase: true, dryRun: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--help" || a === "-h") return "help";
    // Not `--env-file`: tsx hands that flag to Node, which then tries to load the file itself.
    else if (a === "--env") opts.envFile = value();
    else if (a.startsWith("--env=")) opts.envFile = a.slice("--env=".length);
    else if (a === "--email") opts.email = value();
    else if (a.startsWith("--email=")) opts.email = a.slice("--email=".length);
    else if (a === "--password-stdin") opts.passwordStdin = true;
    else if (a === "--no-owner") opts.owner = false;
    else if (a === "--no-supabase") opts.supabase = false;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--yes" || a === "-y") opts.yes = true;
    else throw new Error(`Unknown option ${a} (see --help)`);
  }
  return opts;
}

const say = (s = "") => console.log(s);
const bold = (s: string) => (process.stdout.isTTY ? `\x1b[1m${s}\x1b[22m` : s);
const dim = (s: string) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[22m` : s);

function localSupabaseStatus(): { status: Record<string, string> } | { reason: string } {
  const r = spawnSync("supabase", ["status", "-o", "json"], { encoding: "utf8", timeout: 30_000 });
  if (r.error) return { reason: (r.error as NodeJS.ErrnoException).code === "ENOENT" ? "Supabase CLI not found (brew install supabase/tap/supabase)" : r.error.message };
  if (r.status !== 0) return { reason: "local Supabase isn't running (run `supabase start`)" };
  const status = parseStatusJson(r.stdout);
  return status ? { status } : { reason: "couldn't read `supabase status -o json`" };
}

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((done) =>
    rl.question(question, (answer) => {
      rl.close();
      done(answer.trim());
    }),
  );
}

/** Reads a line without echoing it. */
function askHidden(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const writable = rl as unknown as { _writeToOutput: (s: string) => void };
  let muted = false;
  writable._writeToOutput = (s: string) => {
    if (!muted) process.stdout.write(s);
  };
  return new Promise((done) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      done(answer);
    });
    muted = true; // the prompt is already written; mute the keystrokes that follow
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").split(/\r?\n/)[0] ?? "";
}

async function ownerPassword(opts: Options): Promise<string | null> {
  if (opts.passwordStdin) return readStdin();
  if (!process.stdin.isTTY || opts.yes) return null;
  for (;;) {
    const pw = await askHidden("  Password (12+ characters, letters and digits): ");
    const problem = passwordProblem(pw);
    if (problem) {
      say(`  ${problem}`);
      continue;
    }
    if ((await askHidden("  Repeat password: ")) === pw) return pw;
    say("  The passwords don't match.");
  }
}

async function createOwner(env: Map<string, string>, opts: Options) {
  say(bold("Owner account"));
  const url = env.get("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!isLocalUrl(url)) {
    say(`  Skipped: only created against a local Supabase. ${url ? "This env file points elsewhere." : "No NEXT_PUBLIC_SUPABASE_URL yet."}`);
    say(dim("  Cloud: Supabase dashboard → Authentication → Users → Add user (auto-confirm). The first user claims the instance."));
    return;
  }
  if (!serviceKey) {
    say("  Skipped: SUPABASE_SERVICE_ROLE_KEY is missing (it comes from `supabase status`).");
    return;
  }
  const admin = createClient(url!, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: list, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 10 });
  if (listError) {
    say(`  Skipped: couldn't reach Supabase Auth (${listError.message}).`);
    return;
  }
  if (list.users.length) {
    say(`  Already set up: ${list.users.map((u) => u.email ?? u.id).join(", ")}`);
    return;
  }

  let email = opts.email;
  if (!email && process.stdin.isTTY && !opts.yes) email = await ask("  Owner e-mail (empty to skip): ");
  if (!email) {
    say("  Skipped. Run again with --email you@example.com (or interactively) to create it.");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`"${email}" doesn't look like an e-mail address`);
  const password = await ownerPassword(opts);
  if (!password) {
    say("  Skipped: no password (use --password-stdin when not running in a terminal).");
    return;
  }
  const problem = passwordProblem(password);
  if (problem) throw new Error(`Password rejected: ${problem}`);

  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    say(`  Couldn't create the account: ${error.message}`);
    say(dim("  If this database was claimed by another e-mail before, see `select * from app_settings where key = 'allowed_email'`."));
    process.exitCode = 1;
    return;
  }
  say(`  Created ${data.user?.email ?? email}. Sign in at http://localhost:3100 and add a passkey.`);
}

function printHelp() {
  const src = readFileSync(__filename, "utf8");
  const doc = src.slice(src.indexOf("/**") + 3, src.indexOf("*/"));
  say(doc.replace(/^ \* ?/gm, "").trim());
}

async function main() {
  const parsed = parseOptions(process.argv.slice(2));
  if (parsed === "help") return printHelp();
  const opts = parsed;
  const path = resolve(process.cwd(), opts.envFile);
  const before = existsSync(path) ? readFileSync(path, "utf8") : "";
  const existing = envValues(before);

  say(bold("The Network · bootstrap"));
  say(dim(`  env file ${path}${before ? "" : " (new)"}`));
  say();

  const additions: Record<string, string> = {};
  say(bold("Local Supabase"));
  if (opts.supabase) {
    const res = localSupabaseStatus();
    if ("status" in res) {
      const fromStatus = supabaseEnvFromStatus(res.status);
      const current = existing.get("NEXT_PUBLIC_SUPABASE_URL");
      if (current && !isLocalUrl(current)) {
        say("  Running, but this env file points at a non-local Supabase: leaving the connection settings alone.");
      } else {
        Object.assign(additions, fromStatus, { NEXT_PUBLIC_APP_URL: "http://localhost:3100" });
        say(`  Found at ${fromStatus.NEXT_PUBLIC_SUPABASE_URL ?? "?"}`);
      }
    } else say(`  Not used: ${res.reason}.`);
  } else say("  Not used (--no-supabase).");
  say();

  Object.assign(additions, missingSecrets(existing));
  const merged = mergeEnv(before, additions, `# Added by pnpm bootstrap (${new Date().toISOString().slice(0, 10)})`);

  say(bold("Environment"));
  for (const k of merged.added) say(`  + ${k}`);
  for (const k of merged.filled) say(`  + ${k} ${dim("(was empty)")}`);
  if (merged.kept.length) say(dim(`  kept: ${merged.kept.join(", ")}`));
  if (!merged.added.length && !merged.filled.length) say("  Nothing to add.");
  for (const k of weakSecrets(existing)) say(`  ! ${k} is shorter than ${SECRET_SPECS[k as keyof typeof SECRET_SPECS].minLength} characters; replace it.`);
  if (merged.text !== before) {
    if (opts.dryRun) say(dim("  (dry run: nothing written)"));
    else {
      const tmp = `${path}.${process.pid}.tmp`;
      writeFileSync(tmp, merged.text, { mode: 0o600 });
      renameSync(tmp, path);
      say(dim(`  wrote ${opts.envFile}`));
    }
  }
  say();

  if (opts.owner && !opts.dryRun) {
    await createOwner(envValues(merged.text), opts);
    say();
  }

  const finalEnv = envValues(merged.text);
  say(bold("Next steps"));
  const steps: [string, string][] = [];
  if (!finalEnv.get("NEXT_PUBLIC_SUPABASE_URL")) steps.push(["supabase start && pnpm bootstrap", "local Postgres + Auth, then run this again"]);
  steps.push(["pnpm db:seed-cities", "world cities for city search and the globe (once per database)"]);
  steps.push(["pnpm dev", "http://localhost:3100"]);
  steps.push(["Settings → Security", "add a passkey and save the recovery codes"]);
  steps.push(["Settings → AI & e-mail", "connect an AI provider and Resend/SMTP (or set them in the env file)"]);
  steps.push(["Settings → Setup checklist", "everything else this install still needs"]);
  const width = Math.max(...steps.map(([c]) => c.length));
  steps.forEach(([cmd, what], i) => say(`  ${i + 1}. ${cmd.padEnd(width)}  ${dim(what)}`));
}

if (process.argv[1] && /bootstrap\.ts$/.test(process.argv[1])) {
  main().catch((e: unknown) => {
    console.error(`\nbootstrap failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
