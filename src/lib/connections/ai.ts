import "server-only";
import { secretHint } from "@/lib/crypto/secrets";
import { cached, envValue, fingerprint, loadConnection, saveConnection, statusFor, type ConnectionCheck, type ConnectionSource, type ConnectionStatus, type StoredConnection } from "./store";

/**
 * The AI connection: which provider the app talks to, with which key and models.
 *
 *   const ai = await getAiConfig();   // env first, then Settings → Connections, else provider "off"
 *
 * Environment (read-only in the UI): AI_PROVIDER (agent-sdk | anthropic | openrouter),
 * ANTHROPIC_API_KEY, OPENROUTER_API_KEY, AI_MODEL_MAIN, AI_MODEL_FAST, OPENROUTER_MODEL.
 */

export type AiProvider = "openrouter" | "anthropic" | "agent-sdk" | "off";

export type AiConfig = {
  provider: AiProvider;
  apiKey?: string;
  mainModel: string;
  fastModel: string;
  source: "env" | "db";
};

/** Providers configurable from the UI (agent-sdk needs the local Claude Code CLI → env only). */
export const UI_AI_PROVIDERS = ["anthropic", "openrouter", "off"] as const;
export type UiAiProvider = (typeof UI_AI_PROVIDERS)[number];

export const DEFAULT_AI_MODELS: Record<AiProvider, { main: string; fast: string }> = {
  openrouter: { main: "anthropic/claude-sonnet-5.5", fast: "anthropic/claude-haiku-5.5" },
  anthropic: { main: "claude-sonnet-5-5", fast: "claude-haiku-5-5" },
  "agent-sdk": { main: "sonnet", fast: "haiku" },
  off: { main: "anthropic/claude-sonnet-5.5", fast: "anthropic/claude-haiku-5.5" },
};

export const AI_ENV_VARS = ["AI_PROVIDER", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "AI_MODEL_MAIN", "AI_MODEL_FAST", "OPENROUTER_MODEL"] as const;

type Env = Record<string, string | undefined>;

/** AI settings from environment variables, or null when the environment doesn't configure AI. Pure. */
export function aiConfigFromEnv(env: Env = process.env): AiConfig | null {
  const forced = envValue(env, "AI_PROVIDER");
  const anthropicKey = envValue(env, "ANTHROPIC_API_KEY");
  const openrouterKey = envValue(env, "OPENROUTER_API_KEY");
  let provider: Exclude<AiProvider, "off"> | null = null;
  if (forced === "agent-sdk") provider = "agent-sdk";
  else if (forced === "anthropic" && anthropicKey) provider = "anthropic";
  else if (forced === "openrouter" && openrouterKey) provider = "openrouter";
  else if (anthropicKey) provider = "anthropic";
  else if (openrouterKey) provider = "openrouter";
  if (!provider) return null;
  const defaults = DEFAULT_AI_MODELS[provider];
  const main = envValue(env, "AI_MODEL_MAIN") ?? (provider === "openrouter" ? envValue(env, "OPENROUTER_MODEL") : undefined) ?? defaults.main;
  const fast = envValue(env, "AI_MODEL_FAST") ?? defaults.fast;
  const apiKey = provider === "anthropic" ? anthropicKey : provider === "openrouter" ? openrouterKey : undefined;
  return { provider, ...(apiKey ? { apiKey } : {}), mainModel: main, fastModel: fast, source: "env" };
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** AI settings from a stored connection row. A provider without a usable key resolves to "off". Pure. */
export function aiConfigFromStored(row: Pick<StoredConnection, "provider" | "config" | "secret"> | null): AiConfig | null {
  if (!row) return null;
  const provider = row.provider as AiProvider;
  if (provider !== "anthropic" && provider !== "openrouter") {
    return provider === "off" ? { provider: "off", mainModel: DEFAULT_AI_MODELS.off.main, fastModel: DEFAULT_AI_MODELS.off.fast, source: "db" } : null;
  }
  const defaults = DEFAULT_AI_MODELS[provider];
  const mainModel = str(row.config.mainModel) ?? defaults.main;
  const fastModel = str(row.config.fastModel) ?? defaults.fast;
  if (!row.secret) return { provider: "off", mainModel, fastModel, source: "db" };
  return { provider, apiKey: row.secret, mainModel, fastModel, source: "db" };
}

/** env → db → off. Pure (the precedence rule, unit-tested). */
export function resolveAiConfig(fromEnv: AiConfig | null, fromDb: AiConfig | null): AiConfig {
  return fromEnv ?? fromDb ?? { provider: "off", mainModel: DEFAULT_AI_MODELS.off.main, fastModel: DEFAULT_AI_MODELS.off.fast, source: "db" };
}

/**
 * The active AI configuration. `ownerId` is optional: without it (background jobs) the single
 * owner's stored connection is used. Cached for 60 s per server instance; cleared on save.
 */
export function getAiConfig(ownerId?: string): Promise<AiConfig> {
  const fromEnv = aiConfigFromEnv();
  if (fromEnv) return Promise.resolve(fromEnv);
  return cached(`ai:${ownerId ?? "*"}`, async () => resolveAiConfig(null, aiConfigFromStored(await loadConnection("ai", ownerId))));
}

export function aiFingerprint(config: AiConfig): string {
  return fingerprint(["ai", config.source, config.provider, config.apiKey, config.mainModel, config.fastModel]);
}

/* ---------- view (API) ---------- */

export type AiConnectionView = {
  source: ConnectionSource;
  provider: AiProvider;
  mainModel: string;
  fastModel: string;
  /** Explicit models stored by the user (null = provider default). */
  storedModels: { main: string | null; fast: string | null };
  defaults: Record<AiProvider, { main: string; fast: string }>;
  /** Provider of the stored row (the UI's selection when source is "db"). */
  storedProvider: UiAiProvider | null;
  hasSecret: boolean;
  secretHint: string | null;
  secretError: string | null;
  status: ConnectionStatus;
  check: Pick<ConnectionCheck, "at" | "ok" | "latencyMs" | "model" | "error"> | null;
  /** Environment variables that are set (names only), when the environment manages AI. */
  envVars: string[];
};

export async function getAiConnectionView(ownerId: string): Promise<AiConnectionView> {
  const stored = await loadConnection("ai", ownerId);
  const fromEnv = aiConfigFromEnv();
  const active = resolveAiConfig(fromEnv, aiConfigFromStored(stored));
  const check = stored?.check ?? null;
  const status = statusFor({ configured: active.provider !== "off", source: active.source, fingerprint: aiFingerprint(active) }, check);
  const storedProvider = stored && (UI_AI_PROVIDERS as readonly string[]).includes(stored.provider) ? (stored.provider as UiAiProvider) : null;
  const showStoredSecret = active.source === "db";
  return {
    source: active.source,
    provider: active.provider,
    mainModel: active.mainModel,
    fastModel: active.fastModel,
    storedModels: { main: str(stored?.config.mainModel) ?? null, fast: str(stored?.config.fastModel) ?? null },
    defaults: DEFAULT_AI_MODELS,
    storedProvider,
    hasSecret: active.source === "env" ? !!active.apiKey : !!stored?.secretHint,
    secretHint: showStoredSecret ? (stored?.secretHint ?? null) : active.apiKey ? secretHint(active.apiKey) : null,
    secretError: showStoredSecret ? (stored?.secretError ?? null) : null,
    status,
    check: check && status !== "untested" && status !== "off" ? { at: check.at, ok: check.ok, latencyMs: check.latencyMs, model: check.model, error: check.error } : null,
    envVars: fromEnv ? AI_ENV_VARS.filter((n) => !!envValue(process.env, n)) : [],
  };
}

export type SaveAiInput = { provider: UiAiProvider; apiKey?: string | null; mainModel?: string | null; fastModel?: string | null };

export async function saveAiConnection(ownerId: string, input: SaveAiInput) {
  const config: Record<string, unknown> = {};
  if (input.mainModel?.trim()) config.mainModel = input.mainModel.trim();
  if (input.fastModel?.trim()) config.fastModel = input.fastModel.trim();
  await saveConnection(ownerId, "ai", { provider: input.provider, config, secret: input.provider === "off" ? null : input.apiKey });
}
