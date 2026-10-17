import "server-only";
import { getAiConfig as getConnectionAiConfig, type AiConfig } from "@/lib/connections/ai";

/**
 * Which model the in-app assistant talks to: the AI connection (env first, then Settings →
 * Connections; see src/lib/connections/ai.ts) plus optional chat-only model overrides
 * AI_CHAT_MODEL / AI_CHAT_MODEL_FAST, so the chat can run a different model than the import pipeline.
 */
export type { AiConfig };
export type AiProviderKind = AiConfig["provider"];

/** Applies the chat-only model overrides. Pure (unit-tested). */
export function withChatOverrides(base: AiConfig, env: { AI_CHAT_MODEL?: string; AI_CHAT_MODEL_FAST?: string }): AiConfig {
  const main = env.AI_CHAT_MODEL?.trim();
  const fast = env.AI_CHAT_MODEL_FAST?.trim();
  return { ...base, mainModel: main || base.mainModel, fastModel: fast || base.fastModel };
}

export async function getAiConfig(ownerId?: string): Promise<AiConfig> {
  return withChatOverrides(await getConnectionAiConfig(ownerId), { AI_CHAT_MODEL: process.env.AI_CHAT_MODEL, AI_CHAT_MODEL_FAST: process.env.AI_CHAT_MODEL_FAST });
}
