import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel, ToolSet } from "ai";
import { serverEnv } from "@/lib/env";
import type { AiConfig } from "./config";

/**
 * AI provider switch.
 *  - agent-sdk : your Claude subscription via the Claude Agent SDK (spawns the Claude Code CLI).
 *                Great on your Mac for heavy one-off work (Apple Notes import); not for serverless.
 *  - anthropic : Anthropic API key (console.anthropic.com).
 *  - openrouter: OpenRouter API key (default when OPENROUTER_API_KEY is set).
 *
 * Two entry points:
 *  - `aiModel({ tier })`          the import pipeline (env-configured, strongest models).
 *  - `chatModel(config, tier)`    the in-app assistant (fast models, prompt caching, low effort);
 *                                 driven by `getAiConfig()` so a per-owner connection can replace env.
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

/** Provider clients, one per API key (keys can differ per owner once connections are DB-backed). */
const anthropicClients = new Map<string, ReturnType<typeof createAnthropic>>();
const openrouterClients = new Map<string, ReturnType<typeof createOpenRouter>>();

function anthropicClient(apiKey: string) {
  let c = anthropicClients.get(apiKey);
  if (!c) anthropicClients.set(apiKey, (c = createAnthropic({ apiKey })));
  return c;
}

function openrouterClient(apiKey: string) {
  let c = openrouterClients.get(apiKey);
  if (!c) {
    c = createOpenRouter({ apiKey, headers: { "HTTP-Referer": "https://github.com/uraruguy/Network", "X-Title": "The Network" } });
    openrouterClients.set(apiKey, c);
  }
  return c;
}

/** Maps a canonical model tier to each provider's id (import pipeline). */
const MODELS = {
  main: { "agent-sdk": "opus", anthropic: "claude-opus-5", openrouter: "anthropic/claude-opus-5" },
  fast: { "agent-sdk": "sonnet", anthropic: "claude-sonnet-5", openrouter: "anthropic/claude-sonnet-5" },
} as const;

type ModelOptions = { tier?: "main" | "fast"; tools?: ToolSet; maxTurns?: number };

/** The Claude Code CLI as a model; AI SDK tools are bridged to it as an in-process MCP server. */
async function agentSdkModel(modelId: string, tools: ToolSet | undefined, maxTurns: number): Promise<LanguageModel> {
  // Dynamic import: keeps the Agent SDK (and its 190 MB CLI binary) out of serverless bundles.
  const { claudeCode, createAiSdkMcpServer } = await import("ai-sdk-provider-claude-code");
  const toolNames = tools ? Object.keys(tools).map((n) => `mcp__network__${n}`) : [];
  return claudeCode(modelId, {
    permissionMode: "bypassPermissions",
    settingSources: [],
    ...(tools ? { mcpServers: { network: createAiSdkMcpServer("network", tools) }, allowedTools: toolNames } : { allowedTools: [] }),
    disallowedTools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch", "Task", "NotebookEdit"],
    maxTurns,
    persistSession: false,
  }) as unknown as LanguageModel;
}

/**
 * Returns a language model for the active provider (import pipeline).
 * For agent-sdk, AI SDK tools must be bridged as an MCP server (the CLI executes tools itself),
 * so pass `tools` here as well as to streamText/generateText.
 */
export async function aiModel(opts: ModelOptions = {}): Promise<LanguageModel> {
  const env = serverEnv();
  const provider = aiProvider();
  if (!provider) throw new Error("No AI provider configured (set ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or AI_PROVIDER=agent-sdk)");
  const tier = opts.tier ?? "main";

  if (provider === "agent-sdk") {
    const modelId = tier === "main" ? env.AI_MODEL_MAIN ?? MODELS.main["agent-sdk"] : env.AI_MODEL_FAST ?? MODELS.fast["agent-sdk"];
    return agentSdkModel(modelId, opts.tools, opts.maxTurns ?? 12);
  }
  if (provider === "anthropic") {
    return anthropicClient(env.ANTHROPIC_API_KEY!)(tier === "main" ? env.AI_MODEL_MAIN ?? MODELS.main.anthropic : env.AI_MODEL_FAST ?? MODELS.fast.anthropic);
  }
  return openrouterClient(env.OPENROUTER_API_KEY!).chat(tier === "main" ? env.AI_MODEL_MAIN ?? env.OPENROUTER_MODEL : env.AI_MODEL_FAST ?? MODELS.fast.openrouter);
}

/** Cheaper/faster model for bulk classification passes. */
export function aiFastModel() {
  return aiModel({ tier: "fast" });
}

/** True when tools are executed provider-side (agent-sdk) rather than by the `ai` loop. */
export function toolsAreProviderExecuted() {
  return aiProvider() === "agent-sdk";
}

/* ------------------------------------------------------------------ */
/*  Chat                                                                */
/* ------------------------------------------------------------------ */

export type ChatTier = "main" | "fast";

/** JSON values allowed in provider options. */
type ProviderOptions = Record<string, Record<string, unknown>>;

/**
 * Prompt-cache breakpoint, set on a message's `providerOptions`. Both keys are read by the
 * OpenRouter provider (it forwards `cache_control` to Anthropic); the Anthropic provider reads its own.
 */
export const CACHE_BREAKPOINT: ProviderOptions = {
  anthropic: { cacheControl: { type: "ephemeral" } },
  openrouter: { cacheControl: { type: "ephemeral" } },
};

export type ChatModel = {
  model: LanguageModel;
  modelId: string;
  /** Call-level provider options (effort / reasoning, refusal fallback). */
  providerOptions: ProviderOptions;
  /** agent-sdk: the CLI runs tools itself, so the `ai` loop must not get them. */
  toolsProviderExecuted: boolean;
};

/**
 * The chat model for a tier, tuned for latency: low effort (Sonnet/Haiku 5.5 think adaptively,
 * so simple questions skip thinking), no reasoning sent back to the client, and on Anthropic
 * direct the server-side refusal fallback for the Sonnet tier.
 */
export async function chatModel(config: AiConfig, tier: ChatTier, opts: { tools?: ToolSet } = {}): Promise<ChatModel> {
  const modelId = tier === "fast" ? config.fastModel : config.mainModel;
  switch (config.provider) {
    case "anthropic": {
      const fallback = /^claude-(sonnet|opus|fable)-/.test(modelId) ? { fallbacks: "default" } : {};
      return {
        model: anthropicClient(config.apiKey!)(modelId),
        modelId,
        providerOptions: { anthropic: { effort: "low", ...fallback } },
        toolsProviderExecuted: false,
      };
    }
    case "openrouter":
      return {
        model: openrouterClient(config.apiKey!).chat(modelId, { usage: { include: true } }),
        modelId,
        providerOptions: { openrouter: { reasoning: { effort: "low", exclude: true } } },
        toolsProviderExecuted: false,
      };
    case "agent-sdk":
      return { model: await agentSdkModel(modelId, opts.tools, 10), modelId, providerOptions: {}, toolsProviderExecuted: true };
    default:
      throw new Error("AI is not configured");
  }
}
