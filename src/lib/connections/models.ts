import "server-only";
import { createHash } from "node:crypto";
import { aiConfigFromEnv, aiConfigFromStored } from "./ai";
import { loadConnection } from "./store";

/**
 * Model lists for the model pickers: OpenRouter's public catalogue filtered to `anthropic/*`, or
 * Anthropic's /v1/models (needs a key). Cached for an hour per instance; a short built-in list is
 * the fallback when the catalogue can't be reached (or there's no Anthropic key yet).
 */

export type ModelProvider = "openrouter" | "anthropic";
export type ModelOption = { id: string; name: string; contextLength?: number };
export type ModelList = { provider: ModelProvider; models: ModelOption[]; source: "live" | "fallback"; error?: string };

const FALLBACK: Record<ModelProvider, ModelOption[]> = {
  anthropic: [
    { id: "claude-opus-5-5", name: "Claude Opus 5.5" },
    { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
    { id: "claude-haiku-5-5", name: "Claude Haiku 5.5" },
    { id: "claude-fable-5-1", name: "Claude Fable 5.1" },
    { id: "claude-opus-5", name: "Claude Opus 5" },
    { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
  ],
  openrouter: [
    { id: "anthropic/claude-opus-5.5", name: "Anthropic: Claude Opus 5.5" },
    { id: "anthropic/claude-sonnet-5.5", name: "Anthropic: Claude Sonnet 5.5" },
    { id: "anthropic/claude-haiku-5.5", name: "Anthropic: Claude Haiku 5.5" },
    { id: "anthropic/claude-fable-5.1", name: "Anthropic: Claude Fable 5.1" },
    { id: "anthropic/claude-opus-5", name: "Anthropic: Claude Opus 5" },
    { id: "anthropic/claude-sonnet-5", name: "Anthropic: Claude Sonnet 5" },
  ],
};

const HOUR = 60 * 60_000;
const cache = new Map<string, { at: number; list: ModelList }>();

async function fetchJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<unknown>;
}

async function openrouterModels(): Promise<ModelOption[]> {
  const body = (await fetchJson("https://openrouter.ai/api/v1/models")) as { data?: { id: string; name?: string; context_length?: number; created?: number }[] };
  return (body.data ?? [])
    .filter((m) => m.id.startsWith("anthropic/"))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    .map((m) => ({ id: m.id, name: m.name ?? m.id, ...(m.context_length ? { contextLength: m.context_length } : {}) }));
}

async function anthropicModels(apiKey: string): Promise<ModelOption[]> {
  const out: ModelOption[] = [];
  let after: string | undefined;
  for (let page = 0; page < 5; page++) {
    const qs = new URLSearchParams({ limit: "100", ...(after ? { after_id: after } : {}) });
    const body = (await fetchJson(`https://api.anthropic.com/v1/models?${qs}`, { "x-api-key": apiKey, "anthropic-version": "2023-06-01" })) as {
      data?: { id: string; display_name?: string; max_input_tokens?: number }[];
      has_more?: boolean;
      last_id?: string;
    };
    for (const m of body.data ?? []) out.push({ id: m.id, name: m.display_name ?? m.id, ...(m.max_input_tokens ? { contextLength: m.max_input_tokens } : {}) });
    if (!body.has_more || !body.last_id) break;
    after = body.last_id;
  }
  return out;
}

/** The key to list Anthropic models with: the environment's, else the owner's stored one. */
async function anthropicKey(ownerId: string): Promise<string | undefined> {
  const env = aiConfigFromEnv();
  if (env?.provider === "anthropic") return env.apiKey;
  if (process.env.ANTHROPIC_API_KEY?.trim()) return process.env.ANTHROPIC_API_KEY.trim();
  const stored = aiConfigFromStored(await loadConnection("ai", ownerId));
  return stored?.provider === "anthropic" ? stored.apiKey : undefined;
}

export async function listModels(ownerId: string, provider: ModelProvider): Promise<ModelList> {
  const key = provider === "anthropic" ? await anthropicKey(ownerId) : undefined;
  if (provider === "anthropic" && !key) return { provider, models: FALLBACK.anthropic, source: "fallback", error: "Add an Anthropic API key to load the full list." };
  const cacheKey = provider === "anthropic" ? `anthropic:${createHash("sha256").update(key!).digest("hex").slice(0, 16)}` : provider;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < HOUR) return hit.list;
  try {
    const models = provider === "anthropic" ? await anthropicModels(key!) : await openrouterModels();
    if (!models.length) throw new Error("Empty model list");
    const list: ModelList = { provider, models, source: "live" };
    cache.set(cacheKey, { at: Date.now(), list });
    return list;
  } catch (err) {
    return { provider, models: FALLBACK[provider], source: "fallback", error: `Couldn't load models (${(err as Error).message}).` };
  }
}
