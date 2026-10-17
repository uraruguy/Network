import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { after } from "next/server";
import { z } from "zod";
import { jsonError, NO_STORE } from "@/lib/api-server";
import { getAiConfig } from "@/lib/ai/config";
import { buildSystem, type PromptPerson } from "@/lib/ai/prompt";
import { CACHE_BREAKPOINT, chatModel, type ChatTier } from "@/lib/ai/provider";
import { toAiSdkTools, type ToolCtx } from "@/lib/ai/tools";
import { getOwner } from "@/lib/auth/server";
import { createThread, getThread, saveMessages, type StoredMessage } from "@/lib/data/chat";
import { listPeopleIndex } from "@/lib/data/people";
import { getProfile } from "@/lib/data/profile";
import { listTaxonomy } from "@/lib/data/tags";

/**
 * POST /api/chat — one assistant turn, streamed as a UI message stream.
 *
 * The server owns the transcript: the client sends only its newest message; the thread is loaded
 * here, the reply streams back, and both new messages are persisted when the stream ends — also
 * when the client disconnects mid-answer (the model stream is consumed to completion and the
 * write is kept alive with `after`).
 *
 * Body: { id: <thread uuid>, message: <UI message, text only>, personId?: uuid, model?: "smart" | "fast" }
 */

export const maxDuration = 120;

/** Request body cap (bytes) and per-message text cap (characters). */
const MAX_BODY = 64_000;
const MAX_TEXT = 8_000;
/** Messages of history sent to the model (the database keeps everything). */
const HISTORY_WINDOW = 40;

const body = z.object({
  id: z.string().uuid(),
  message: z.object({
    id: z.string().min(1).max(100),
    role: z.literal("user"),
    parts: z.array(z.object({ type: z.literal("text"), text: z.string().min(1).max(MAX_TEXT) })).min(1).max(8),
  }),
  personId: z.string().uuid().nullish(),
  model: z.enum(["smart", "fast"]).default("smart"),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A provider failure as something the user can act on (details stay in the server log). */
function friendlyError(error: unknown): string {
  const e = (error && typeof error === "object" && "lastError" in error ? (error as { lastError: unknown }).lastError : error) as { statusCode?: number } | null;
  const status = e && typeof e === "object" ? e.statusCode : undefined;
  console.error("[chat] model error", error);
  if (status === 401 || status === 403) return "The AI provider rejected the API key. Check the AI connection in Settings.";
  if (status === 402) return "The AI provider account is out of credits.";
  if (status === 429) return "The AI provider is busy (rate limit). Try again in a moment.";
  if (status && status >= 500) return "The AI provider is having trouble right now. Try again in a moment.";
  return "Something went wrong while answering. Try again.";
}

export async function POST(req: Request) {
  const owner = await getOwner();
  if (!owner) return jsonError(401, "unauthenticated", "Not signed in");
  if (!owner.mfaSatisfied) return jsonError(401, "mfa_required", "Passkey verification required");

  const raw = await req.text();
  if (raw.length > MAX_BODY) return jsonError(413, "too_large", "Message too long");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return jsonError(400, "bad_request", "Invalid JSON");
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return jsonError(422, "invalid", "Invalid chat message");
  const { id: threadId, personId, model: modelChoice } = parsed.data;
  const ownerId = owner.id;

  const config = await getAiConfig();
  if (config.provider === "off") return jsonError(400, "ai_not_configured", "AI is not configured (see .env.example)");

  // Everything the prompt needs, in parallel: one round trip's worth of latency.
  const [profile, taxonomy, index, thread] = await Promise.all([getProfile(ownerId), listTaxonomy(ownerId), listPeopleIndex(ownerId), getThread(ownerId, threadId)]);

  const userMessage: UIMessage = {
    id: UUID.test(parsed.data.message.id) ? parsed.data.message.id : crypto.randomUUID(),
    role: "user",
    parts: parsed.data.message.parts,
  };
  const firstText = userMessage.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").replace(/\s+/g, " ").trim();

  let focusId = thread?.personId ?? null;
  if (!thread) {
    focusId = personId && index.some((p) => p.id === personId) ? personId : null;
    const created = await createThread(ownerId, { id: threadId, personId: focusId, title: firstText.slice(0, 80) || null });
    if (!created) return jsonError(404, "not_found", "Unknown conversation");
  }

  const timezone = profile?.timezone ?? "UTC";
  const ctx: ToolCtx = { ownerId, scopes: ["network:read", "network:write"], actor: { via: "chat", client: "assistant", credential: "assistant" }, timezone };
  const tools = toAiSdkTools(ctx);
  const tier: ChatTier = modelChoice === "fast" ? "fast" : "main";
  const llm = await chatModel(config, tier, { tools });

  // Prompt: rules + taxonomy/people index (both cached) + per-day tail.
  const names = {
    categories: new Map(taxonomy.categories.map((c) => [c.id, c.name])),
    tags: new Map(taxonomy.tags.map((t) => [t.id, t.name])),
  };
  const people: PromptPerson[] = index.map((p) => ({
    id: p.id,
    name: p.displayName,
    city: p.homeLocation ? `${p.homeLocation.name}${p.homeLocation.countryCode ? `/${p.homeLocation.countryCode}` : ""}` : null,
    categories: p.categoryIds.map((id) => names.categories.get(id)).filter((n): n is string => !!n),
    tags: p.tagIds.map((id) => names.tags.get(id)).filter((n): n is string => !!n),
  }));
  const focus = focusId ? people.find((p) => p.id === focusId) : undefined;
  const instructions = buildSystem({
    ownerName: profile?.displayName ?? null,
    timezone,
    homeCity: profile?.homeLocation ? `${profile.homeLocation.name}, ${profile.homeLocation.country}` : null,
    categories: taxonomy.categories.map((c) => c.name),
    activities: taxonomy.activities.map((a) => ({ name: a.name, emoji: a.emoji })),
    tags: taxonomy.tags.map((t) => t.name),
    people,
    focus: focus ? { id: focus.id, name: focus.name } : null,
  });

  // History: stored messages (trusted, but validated so one bad row can't break the thread).
  const all = [...((thread?.messages ?? []) as UIMessage[]), userMessage];
  const valid = await safeValidateUIMessages({ messages: all.slice(-HISTORY_WINDOW), tools });
  if (!valid.success) console.warn("[chat] stored history failed validation; answering without it", valid.error.message);
  const windowed = valid.success ? valid.data : [userMessage];
  const messages: ModelMessage[] = await convertToModelMessages(windowed, { tools, ignoreIncompleteToolCalls: true });
  // Cache breakpoint 3: the newest message, so tool-loop steps and the next turn reuse the prefix.
  const last = messages[messages.length - 1];
  if (last) last.providerOptions = { ...last.providerOptions, ...(CACHE_BREAKPOINT as ModelMessage["providerOptions"]) };

  const result = streamText({
    model: llm.model,
    instructions,
    messages,
    // With the Agent SDK the CLI runs the tools itself (bridged as MCP); the `ai` loop must not also try.
    ...(llm.toolsProviderExecuted ? {} : { tools, stopWhen: stepCountIs(6) }),
    maxOutputTokens: 2000,
    providerOptions: llm.providerOptions as Parameters<typeof streamText>[0]["providerOptions"],
  });
  // Run the model to the end even if the client goes away, so the answer is still saved.
  void result.consumeStream({ onError: (e) => console.error("[chat] stream", e) });

  let finished!: () => void;
  const persisted = new Promise<void>((resolve) => (finished = resolve));
  after(() => persisted);

  const stream = toUIMessageStream({
    stream: result.stream,
    tools,
    originalMessages: all,
    generateMessageId: () => crypto.randomUUID(),
    sendReasoning: false,
    messageMetadata: ({ part }) => {
      if (part.type === "start") return { model: modelChoice };
      if (part.type === "finish") return { model: modelChoice, modelId: llm.modelId, usage: part.totalUsage };
      return undefined;
    },
    onError: friendlyError,
    onEnd: async ({ responseMessage }) => {
      try {
        const toSave: (StoredMessage & { usage?: Record<string, unknown> | null })[] = [{ id: userMessage.id, role: "user", parts: userMessage.parts }];
        if (responseMessage.role === "assistant" && responseMessage.parts.length) {
          const meta = (responseMessage.metadata ?? null) as Record<string, unknown> | null;
          toSave.push({ id: UUID.test(responseMessage.id) ? responseMessage.id : crypto.randomUUID(), role: "assistant", parts: responseMessage.parts, usage: meta });
        }
        await saveMessages(ownerId, threadId, toSave);
      } catch (err) {
        console.error("[chat] failed to save messages", err);
      } finally {
        finished();
      }
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: { "cache-control": NO_STORE },
    // Drain a copy server-side: keeps the UI stream (and `onEnd`) running after a disconnect.
    consumeSseStream: async ({ stream: copy }) => {
      const reader = copy.getReader();
      while (!(await reader.read()).done) {
        // discard
      }
    },
  });
}
