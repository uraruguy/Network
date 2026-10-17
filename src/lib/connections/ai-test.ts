import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { aiFingerprint, getAiConfig, type AiConfig } from "./ai";
import { clearConnectionCache, recordCheck } from "./store";

export type AiTestResult = { ok: boolean; latencyMs?: number; model?: string; provider: AiConfig["provider"]; source: AiConfig["source"]; error?: string };

/** Short, safe error text from a provider failure (never echoes the key). */
export function describeAiError(err: unknown): string {
  const e = err as { statusCode?: number; status?: number; message?: string; responseBody?: string; data?: { error?: { message?: string } } };
  const status = e?.statusCode ?? e?.status;
  const detail = e?.data?.error?.message ?? e?.message ?? "Request failed";
  if (status === 401 || status === 403) return "The API key was rejected (401). Check that it's correct and active.";
  if (status === 402) return "The account is out of credits (402).";
  if (status === 404) return `Model not found (404): ${detail}`.slice(0, 300);
  if (status === 429) return "Rate limited (429). Try again in a moment.";
  return (status ? `${status}: ${detail}` : detail).replace(/(sk|re)[-_][\w-]{8,}/g, "$1-…").slice(0, 300);
}

/**
 * Sends a 1-token request to the active provider's main model and records the result (latency,
 * the model that answered) on the connection. Uses the provider SDKs directly so it doesn't depend
 * on the app's model wiring.
 */
export async function testAiConnection(ownerId: string): Promise<AiTestResult> {
  clearConnectionCache();
  const config = await getAiConfig(ownerId);
  const base = { provider: config.provider, source: config.source };
  if (config.provider === "off") return { ...base, ok: false, error: "AI is turned off." };
  if (config.provider === "agent-sdk") {
    return { ...base, ok: false, error: "The Claude subscription (agent-sdk) runs through the local Claude Code CLI and can't be tested from here." };
  }
  if (!config.apiKey) return { ...base, ok: false, error: "No API key." };

  const model =
    config.provider === "anthropic"
      ? createAnthropic({ apiKey: config.apiKey })(config.mainModel)
      : createOpenRouter({ apiKey: config.apiKey, headers: { "HTTP-Referer": "https://github.com/uraruguy/Network", "X-Title": "The Network" } }).chat(config.mainModel);

  const started = performance.now();
  let result: AiTestResult;
  try {
    const res = await generateText({ model, prompt: "Reply with the single word: ok", maxOutputTokens: 1, maxRetries: 0, abortSignal: AbortSignal.timeout(30_000) });
    const latencyMs = Math.round(performance.now() - started);
    result = { ...base, ok: true, latencyMs, model: res.response?.modelId || config.mainModel };
  } catch (err) {
    result = { ...base, ok: false, latencyMs: Math.round(performance.now() - started), model: config.mainModel, error: describeAiError(err) };
  }
  await recordCheck(ownerId, "ai", config.provider, {
    ok: result.ok,
    source: config.source,
    fingerprint: aiFingerprint(config),
    latencyMs: result.latencyMs,
    model: result.model,
    error: result.error,
  });
  return result;
}
