import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { serverEnv } from "@/lib/env";

let provider: ReturnType<typeof createOpenRouter> | null = null;

export function aiConfigured() {
  return !!serverEnv().OPENROUTER_API_KEY;
}

/** Claude via OpenRouter. Model id configurable with OPENROUTER_MODEL (default anthropic/claude-opus-5). */
export function aiModel(override?: string) {
  const env = serverEnv();
  if (!env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set");
  provider ??= createOpenRouter({
    apiKey: env.OPENROUTER_API_KEY,
    headers: { "HTTP-Referer": "https://github.com/uraruguy/Network", "X-Title": "The Network" },
  });
  return provider.chat(override ?? env.OPENROUTER_MODEL);
}

/** Cheaper/faster model for bulk classification passes. */
export function aiFastModel() {
  return aiModel(process.env.OPENROUTER_FAST_MODEL ?? "anthropic/claude-sonnet-5");
}
