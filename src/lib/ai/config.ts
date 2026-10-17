import "server-only";
import { z } from "zod";
import { serverEnv } from "@/lib/env";

/**
 * Which model the in-app assistant talks to.
 *
 * Today this reads environment variables. The Settings track replaces it with a per-owner,
 * database-backed connection (`src/lib/connections/ai.ts`, same `AiConfig` type). The swap is one
 * line — replace the `getAiConfig` implementation below with:
 *
 *   export { getAiConfig } from "@/lib/connections/ai";
 *
 * Provider choice (env): AI_PROVIDER forces one; otherwise Anthropic direct when
 * ANTHROPIC_API_KEY is set (lowest latency, native prompt caching), else OpenRouter, else off.
 * Optional model overrides for the chat only: AI_CHAT_MODEL / AI_CHAT_MODEL_FAST (the import
 * pipeline keeps using AI_MODEL_MAIN / AI_MODEL_FAST).
 */

export type AiProviderKind = "openrouter" | "anthropic" | "agent-sdk" | "off";

export type AiConfig = {
  provider: AiProviderKind;
  apiKey?: string;
  /** "Smart" — the default chat model. */
  mainModel: string;
  /** "Fast" — cheaper, quicker answers. */
  fastModel: string;
  source: "env" | "db";
};

/** Default chat models per provider (the current Sonnet / Haiku). */
export const DEFAULT_CHAT_MODELS: Record<Exclude<AiProviderKind, "off">, { main: string; fast: string }> = {
  anthropic: { main: "claude-sonnet-5-5", fast: "claude-haiku-5-5" },
  openrouter: { main: "anthropic/claude-sonnet-5.5", fast: "anthropic/claude-haiku-5.5" },
  "agent-sdk": { main: "sonnet", fast: "haiku" },
};

const chatEnv = z.object({
  AI_CHAT_MODEL: z.string().trim().min(1).optional(),
  AI_CHAT_MODEL_FAST: z.string().trim().min(1).optional(),
});

/** Pure resolution from an environment (unit-tested). */
export function aiConfigFromEnv(env: {
  AI_PROVIDER?: string;
  ANTHROPIC_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  AI_CHAT_MODEL?: string;
  AI_CHAT_MODEL_FAST?: string;
}): AiConfig {
  let provider: AiProviderKind = "off";
  let apiKey: string | undefined;
  if (env.AI_PROVIDER === "agent-sdk") provider = "agent-sdk";
  else if (env.AI_PROVIDER === "anthropic" && env.ANTHROPIC_API_KEY) [provider, apiKey] = ["anthropic", env.ANTHROPIC_API_KEY];
  else if (env.AI_PROVIDER === "openrouter" && env.OPENROUTER_API_KEY) [provider, apiKey] = ["openrouter", env.OPENROUTER_API_KEY];
  else if (env.ANTHROPIC_API_KEY) [provider, apiKey] = ["anthropic", env.ANTHROPIC_API_KEY];
  else if (env.OPENROUTER_API_KEY) [provider, apiKey] = ["openrouter", env.OPENROUTER_API_KEY];

  const defaults = provider === "off" ? { main: "", fast: "" } : DEFAULT_CHAT_MODELS[provider];
  return {
    provider,
    ...(apiKey ? { apiKey } : {}),
    mainModel: env.AI_CHAT_MODEL ?? defaults.main,
    fastModel: env.AI_CHAT_MODEL_FAST ?? defaults.fast,
    source: "env",
  };
}

export async function getAiConfig(): Promise<AiConfig> {
  const env = serverEnv();
  const chat = chatEnv.parse({ AI_CHAT_MODEL: process.env.AI_CHAT_MODEL, AI_CHAT_MODEL_FAST: process.env.AI_CHAT_MODEL_FAST });
  return aiConfigFromEnv({ ...env, ...chat });
}
