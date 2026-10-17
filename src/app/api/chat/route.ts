import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { z } from "zod";
import { jsonError } from "@/lib/api-server";
import { aiConfigured, aiModel, toolsAreProviderExecuted } from "@/lib/ai/provider";
import { networkTools } from "@/lib/ai/tools";
import { getOwner } from "@/lib/auth/server";
import { listCategories } from "@/lib/data/categories";
import { ensureThread, saveMessages } from "@/lib/data/chat";
import { getProfile } from "@/lib/data/profile";

export const maxDuration = 120;

const body = z.object({
  id: z.string().uuid().optional().catch(undefined),
  messages: z.array(z.custom<UIMessage>()),
  personId: z.string().uuid().nullish(),
});

export async function POST(req: Request) {
  const owner = await getOwner();
  if (!owner) return jsonError(401, "unauthenticated", "Not signed in");
  if (!owner.mfaSatisfied) return jsonError(401, "mfa_required", "Passkey verification required");
  if (!aiConfigured()) return jsonError(400, "ai_not_configured", "AI is not configured (see .env.example)");
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "bad_request", "Bad request");
  const { id, messages, personId } = parsed.data;
  const ownerId = owner.id;

  const [profile, cats, thread] = await Promise.all([getProfile(ownerId), listCategories(ownerId), ensureThread(ownerId, id, personId)]);
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeZone: profile?.timezone ?? "Europe/Ljubljana" }).format(now);

  const system = `You are The Network — ${profile?.displayName ?? "Jakob"}'s personal relationship assistant. You have tools over his private database of people, notes and follow-ups.
Today is ${today} (${profile?.timezone ?? "Europe/Ljubljana"}). Home base: ${profile?.homeLocation ? `${profile.homeLocation.name}, ${profile.homeLocation.country}` : "Ljubljana, Slovenia"}.
Categories in use: ${cats.map((c) => c.name).join(", ")}. Warmth levels: inner, active, dormant, archive. Circles: nice_to_know, hang_out_more, potential_close.

Rules:
- Answer in the language the user writes in (Slovenian or English). His notes mix colloquial Slovenian and English — read both.
- Always use tools to look things up before answering about people; never guess names or facts. Cite the person by name; you may link as [Name](/people/ID).
- Be concise and warm, like a sharp chief of staff. Use short lists when listing people.
- For writes (notes, reminders, new people): if the target person or the details are ambiguous, ask a brief clarifying question first. Otherwise act, then confirm in one line what you did.
- When asked "who should I follow up with", combine due_followups with dormant/important people not contacted recently.
- Dates: convert relative phrases ("in 3 months") to ISO date-times at 09:00 local when creating reminders.${personId ? `\nThe user opened this chat from a specific person's page (id ${personId}). Assume questions refer to them unless stated otherwise; call get_person first.` : ""}`;

  const tools = networkTools(ownerId);
  const providerExecuted = toolsAreProviderExecuted();
  const result = streamText({
    model: await aiModel({ tools, maxTurns: 10 }),
    system,
    messages: await convertToModelMessages(messages),
    // With the Agent SDK the CLI runs the tools itself (bridged as MCP); the `ai` loop must not also try.
    ...(providerExecuted ? {} : { tools, stopWhen: stepCountIs(8) }),
    maxOutputTokens: 2000,
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ messages: all }) => {
      const firstUser = all.find((m) => m.role === "user");
      const title = firstUser?.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim().slice(0, 80) || undefined;
      await saveMessages(ownerId, thread.id, all as { id: string; role: string; parts: unknown }[], title);
    },
  });
}
