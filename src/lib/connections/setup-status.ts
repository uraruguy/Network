import "server-only";
import { readdirSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getAiConnectionView } from "./ai";
import { getEmailConnectionView } from "./email";
import type { ConnectionStatus } from "./store";

/**
 * "Is this install ready?" — one row per thing a self-hoster has to get right, each with a short
 * explanation and a fix (a link into Settings or a command to run). Read-only and cheap: no
 * outside calls (AI / e-mail use the last recorded connection test).
 */

/**
 * Newest migration this build knows about. Used when the migrations folder isn't available at
 * runtime (serverless bundles); keep it in step with supabase/migrations.
 */
export const LATEST_KNOWN_MIGRATION = "20261018000600";

export type SetupState = "ok" | "todo" | "warn" | "error";
export type SetupItem = {
  id: string;
  label: string;
  state: SetupState;
  detail: string;
  /** Link to fix it in the app. */
  href?: string;
  /** Command to run instead (shown copyable). */
  command?: string;
  /** Nice to have; doesn't count against "complete". */
  optional?: boolean;
};
export type SetupStatus = { items: SetupItem[]; done: number; total: number; complete: boolean; checkedAt: string };

function latestMigrationFile(): string {
  try {
    const files = readdirSync(path.join(process.cwd(), "supabase", "migrations")).filter((f) => /^\d{14}_.*\.sql$/.test(f));
    const newest = files.map((f) => f.slice(0, 14)).sort().at(-1);
    if (newest && newest > LATEST_KNOWN_MIGRATION) return newest;
  } catch {
    // Not shipped with this deployment — fall back to the constant.
  }
  return LATEST_KNOWN_MIGRATION;
}

async function one<T>(query: ReturnType<typeof sql>): Promise<T | null> {
  try {
    const [row] = await db.execute<T & Record<string, unknown>>(query);
    return (row as T) ?? null;
  } catch {
    return null;
  }
}

const connectionState = (s: ConnectionStatus): SetupState => (s === "verified" ? "ok" : s === "error" ? "error" : s === "untested" ? "warn" : "todo");

export async function getSetupStatus(ownerId: string, env: Record<string, string | undefined> = process.env): Promise<SetupStatus> {
  const latest = latestMigrationFile();
  const [migration, counts, cron, ai, email] = await Promise.all([
    one<{ version: string | null }>(sql`select max(version) as version from supabase_migrations.schema_migrations`),
    one<{ cities: boolean; owners: number; passkeys: number; recovery: number; tokens: number; grants: number }>(sql`
      select
        exists (select 1 from cities) as cities,
        (select count(*)::int from profiles) as owners,
        (select count(*)::int from webauthn_credentials where owner_id = ${ownerId}) as passkeys,
        (select count(*)::int from mfa_recovery_codes where owner_id = ${ownerId} and used_at is null) as recovery,
        (select count(*)::int from api_tokens where owner_id = ${ownerId} and revoked_at is null and last_used_at is not null) as tokens,
        (select count(*)::int from oauth_client_grants where owner_id = ${ownerId} and revoked_at is null) as grants`),
    one<{ job: boolean; target: boolean }>(sql`
      select
        exists (select 1 from cron.job where jobname = 'network-digest') as job,
        exists (select 1 from app_settings where key = 'app_url') and exists (select 1 from app_settings where key = 'cron_secret') as target`),
    getAiConnectionView(ownerId),
    getEmailConnectionView(ownerId),
  ]);

  const items: SetupItem[] = [];

  const applied = migration?.version ?? null;
  items.push(
    applied && applied >= latest
      ? { id: "migrations", label: "Database up to date", state: "ok", detail: `Latest migration ${applied} is applied.` }
      : {
          id: "migrations",
          label: "Database up to date",
          state: applied ? "error" : "warn",
          detail: applied ? `Applied ${applied}, this version needs ${latest}.` : "Couldn't read the migration history. Make sure every file in supabase/migrations is applied.",
          command: "supabase db push",
        },
  );

  items.push(
    counts?.cities
      ? { id: "cities", label: "World cities loaded", state: "ok", detail: "City search and the globe have their reference data." }
      : { id: "cities", label: "World cities loaded", state: "todo", detail: "City search and home base need the cities table.", command: "pnpm db:seed-cities" },
  );

  items.push(
    (counts?.owners ?? 0) > 0
      ? { id: "owner", label: "Owner account", state: "ok", detail: "You're signed in as the owner." }
      : { id: "owner", label: "Owner account", state: "todo", detail: "No profile row exists for your account yet." },
  );

  const secret = env.APP_SECRET ?? "";
  items.push(
    secret.length >= 32
      ? { id: "app-secret", label: "App secret", state: "ok", detail: "APP_SECRET is set — sessions are signed and connection secrets encrypted." }
      : {
          id: "app-secret",
          label: "App secret",
          state: "error",
          detail: "APP_SECRET (≥ 32 characters) signs passkey sessions and encrypts stored API keys. Add it to your environment and redeploy.",
          command: "openssl rand -base64 48",
        },
  );

  const passkeyRequired = env.AUTH_REQUIRE_PASSKEY !== "false";
  items.push(
    (counts?.passkeys ?? 0) > 0
      ? { id: "passkey", label: "Passkey", state: "ok", detail: `${counts!.passkeys} passkey${counts!.passkeys === 1 ? "" : "s"} enrolled.`, href: "/settings/security" }
      : { id: "passkey", label: "Passkey", state: passkeyRequired ? "todo" : "warn", detail: passkeyRequired ? "Add a passkey as your second factor." : "Passkeys are off (AUTH_REQUIRE_PASSKEY=false). Add one before going live.", href: "/settings/security" },
  );

  items.push(
    (counts?.recovery ?? 0) > 0
      ? { id: "recovery", label: "Recovery codes", state: "ok", detail: `${counts!.recovery} unused recovery code${counts!.recovery === 1 ? "" : "s"}.`, href: "/settings/security" }
      : { id: "recovery", label: "Recovery codes", state: "todo", detail: "Generate recovery codes in case you lose your passkey.", href: "/settings/security" },
  );

  const aiState = connectionState(ai.status);
  items.push({
    id: "ai",
    label: "AI provider",
    state: aiState,
    detail:
      ai.status === "verified"
        ? `${providerName(ai.provider)} · ${ai.mainModel}${ai.check?.latencyMs ? ` · ${ai.check.latencyMs} ms` : ""}${ai.source === "env" ? " · from environment" : ""}`
        : ai.status === "error"
          ? `Last test failed: ${ai.check?.error ?? "unknown error"}`
          : ai.status === "untested"
            ? `${providerName(ai.provider)} is set up but hasn't been tested.`
            : "Connect Anthropic or OpenRouter to use chat and imports.",
    href: "/settings/connections#ai",
  });

  items.push({
    id: "email",
    label: "E-mail sending",
    state: connectionState(email.status),
    detail:
      email.status === "verified"
        ? `${email.provider === "smtp" ? "SMTP" : "Resend"} · ${email.from}${email.source === "env" ? " · from environment" : ""}`
        : email.status === "error"
          ? `Last test failed: ${email.check?.error ?? "unknown error"}`
          : email.status === "untested"
            ? "Configured but no test e-mail sent yet."
            : "Connect Resend or an SMTP server for the daily digest.",
    href: "/settings/connections#email",
  });

  const onVercel = !!env.VERCEL;
  const cronSecret = (env.CRON_SECRET ?? "").length >= 16;
  const scheduled = (cron?.job && cron.target) || onVercel;
  items.push(
    scheduled && cronSecret
      ? { id: "digest", label: "Digest schedule", state: "ok", detail: cron?.job ? "pg_cron calls the digest every hour." : "Vercel Cron calls the digest (see vercel.json).", href: "/settings/digest" }
      : !cronSecret
        ? { id: "digest", label: "Digest schedule", state: "todo", detail: "Set CRON_SECRET (≥ 16 characters) so the scheduler can call /api/cron/reminders.", command: "openssl rand -hex 24" }
        : {
            id: "digest",
            label: "Digest schedule",
            state: "todo",
            detail: "Nothing calls the digest yet. With Supabase pg_cron, run this once in the SQL editor (your URL + CRON_SECRET):",
            command: "select set_digest_target('https://your-app.example.com', '<CRON_SECRET>');",
            href: "/settings/digest",
          },
  );

  const mcp = (counts?.tokens ?? 0) + (counts?.grants ?? 0);
  items.push(
    mcp > 0
      ? { id: "mcp", label: "Connected apps (MCP)", state: "ok", detail: `${mcp} app${mcp === 1 ? "" : "s"} connected.`, href: "/settings/apps", optional: true }
      : { id: "mcp", label: "Connected apps (MCP)", state: "todo", detail: "Optional: let Claude or other MCP clients read your network.", href: "/settings/apps", optional: true },
  );

  const required = items.filter((i) => !i.optional);
  const done = required.filter((i) => i.state === "ok").length;
  return { items, done, total: required.length, complete: done === required.length, checkedAt: new Date().toISOString() };
}

function providerName(p: string) {
  return p === "openrouter" ? "OpenRouter" : p === "anthropic" ? "Anthropic" : p === "agent-sdk" ? "Claude subscription" : "Off";
}
