/**
 * AI provider guard for import scripts.
 * Default provider is the Claude subscription (`agent-sdk`, $0). Paid providers (openrouter /
 * anthropic API keys) need an explicit `--allow-paid`.
 */
import type { Args } from "./_env";

/** Env vars a parent Claude Code session sets that break the nested CLI's own OAuth login. */
const HOST_SESSION_VARS = [/^CLAUDECODE$/, /^CLAUDE_CODE_/, /^CLAUDE_AGENT_SDK_/, /^USE_STAGING_OAUTH$/, /^USE_LOCAL_OAUTH$/, /^CLAUDE_PID$/, /^CLAUDE_EFFORT$/, /^CLAUDE_PREVIEW_/];

export function prepareAi(args: Args) {
  const provider = args.opt("--provider", "agent-sdk")!;
  if (!["agent-sdk", "anthropic", "openrouter"].includes(provider)) throw new Error(`Unknown --provider ${provider}`);
  if (provider !== "agent-sdk" && !args.flag("--allow-paid")) {
    throw new Error(`--provider ${provider} uses a paid API key; pass --allow-paid to confirm (default is agent-sdk = Claude subscription).`);
  }
  process.env.AI_PROVIDER = provider;
  if (provider === "agent-sdk") {
    // OpenRouter-style ids ("anthropic/claude-…") are meaningless to the Claude Code CLI.
    for (const k of ["AI_MODEL_MAIN", "AI_MODEL_FAST"]) if (process.env[k]?.includes("/")) delete process.env[k];
    const main = args.opt("--model");
    if (main) process.env.AI_MODEL_MAIN = main;
    const fast = args.opt("--fast-model");
    if (fast) process.env.AI_MODEL_FAST = fast;
    // Running nested inside a Claude Code session: drop the host session's env so the spawned CLI
    // uses the machine's own subscription login (keychain) instead of the parent's revoked token.
    if (process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT) {
      for (const k of Object.keys(process.env)) if (HOST_SESSION_VARS.some((re) => re.test(k))) delete process.env[k];
      if (process.env.ANTHROPIC_BASE_URL && !args.flag("--keep-base-url")) delete process.env.ANTHROPIC_BASE_URL;
    }
  }
  console.error(`· ai provider ${provider}${provider === "agent-sdk" ? ` (main ${process.env.AI_MODEL_MAIN ?? "opus"}, fast ${process.env.AI_MODEL_FAST ?? "sonnet"})` : ""}`);
  return provider as "agent-sdk" | "anthropic" | "openrouter";
}

/** True when an error looks like a rate/usage limit (stop and resume later rather than fail items). */
export function isRateLimit(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  return /rate.?limit|429|usage limit|overloaded|529|quota|too many requests|limit reached|credit balance/i.test(m);
}
