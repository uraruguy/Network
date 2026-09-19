import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel, ToolSet } from "ai";
import { serverEnv } from "@/lib/env";

/**
 * AI provider switch.
 *  - agent-sdk : your Claude subscription via the Claude Agent SDK (spawns the Claude Code CLI).
 *                Great on your Mac for heavy one-off work (Apple Notes import); not for serverless.
 *  - anthropic : Anthropic API key (console.anthropic.com).
 *  - openrouter: OpenRouter API key (default when OPENROUTER_API_KEY is set).
 */
export type AiProvider = "agent-sdk" | "anthropic" | "openrouter";

export function aiProvider(): AiProvider | null {
  const env = serverEnv();
  const forced = env.AI_PROVIDER;
  if (forced === "agent-sdk") return "agent-sdk";
  if (forced === "anthropic" && env.ANTHROPIC_API_KEY) return "anthropic";
  if (forced === "openrouter" && env.OPENROUTER_API_KEY) return "openrouter";
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.OPENROUTER_API_KEY) return "openrouter";
  return null;
}

export function aiConfigured() {
  return aiProvider() !== null;
}

let openrouter: ReturnType<typeof createOpenRouter> | null = null;
let anthropic: ReturnType<typeof createAnthropic> | null = null;

/** Maps a canonical model tier to each provider's id. */
const MODELS = {
  main: { "agent-sdk": "opus", anthropic: "claude-opus-5", openrouter: "anthropic/claude-opus-5" },
  fast: { "agent-sdk": "sonnet", anthropic: "claude-sonnet-5", openrouter: "anthropic/claude-sonnet-5" },
} as const;

type ModelOptions = { tier?: "main" | "fast"; tools?: ToolSet; maxTurns?: number };

/**
 * Returns a language model for the active provider.
 * For agent-sdk, AI SDK tools must be bridged as an MCP server (the CLI executes tools itself),
 * so pass `tools` here as well as to streamText/generateText.
 */
export async function aiModel(opts: ModelOptions = {}): Promise<LanguageModel> {
  const env = serverEnv();
  const provider = aiProvider();
  if (!provider) throw new Error("No AI provider configured (set ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or AI_PROVIDER=agent-sdk)");
  const tier = opts.tier ?? "main";

  if (provider === "agent-sdk") {
    // Dynamic import: keeps the Agent SDK (and its 190 MB CLI binary) out of serverless bundles.
    const { claudeCode, createAiSdkMcpServer } = await import("ai-sdk-provider-claude-code");
    const modelId = tier === "main" ? env.AI_MODEL_MAIN ?? MODELS.main["agent-sdk"] : env.AI_MODEL_FAST ?? MODELS.fast["agent-sdk"];
    const toolNames = opts.tools ? Object.keys(opts.tools).map((n) => `mcp__network__${n}`) : [];
    return claudeCode(modelId, {
      permissionMode: "bypassPermissions",
      settingSources: [],
      ...(opts.tools ? { mcpServers: { network: createAiSdkMcpServer("network", opts.tools) }, allowedTools: toolNames } : { allowedTools: [] }),
      disallowedTools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch", "Task", "NotebookEdit"],
      maxTurns: opts.maxTurns ?? 12,
      persistSession: false,
    }) as unknown as LanguageModel;
  }

  if (provider === "anthropic") {
    anthropic ??= createAnthropic({ apiKey: env.ANTHROPIC_API_KEY! });
    return anthropic(tier === "main" ? env.AI_MODEL_MAIN ?? MODELS.main.anthropic : env.AI_MODEL_FAST ?? MODELS.fast.anthropic);
  }

  openrouter ??= createOpenRouter({
    apiKey: env.OPENROUTER_API_KEY!,
    headers: { "HTTP-Referer": "https://github.com/uraruguy/Network", "X-Title": "The Network" },
  });
  return openrouter.chat(tier === "main" ? env.AI_MODEL_MAIN ?? env.OPENROUTER_MODEL : env.AI_MODEL_FAST ?? MODELS.fast.openrouter);
}

/** Cheaper/faster model for bulk classification passes. */
export function aiFastModel() {
  return aiModel({ tier: "fast" });
}

/** True when tools are executed provider-side (agent-sdk) rather than by the `ai` loop. */
export function toolsAreProviderExecuted() {
  return aiProvider() === "agent-sdk";
}
