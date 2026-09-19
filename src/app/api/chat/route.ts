import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { aiConfigured, aiModel } from "@/lib/ai/provider";
import { networkTools } from "@/lib/ai/tools";
import { listCategories } from "@/lib/data/categories";
import { ensureThread, saveMessages } from "@/lib/data/chat";
import { getProfile } from "@/lib/data/profile";
import { currentUser } from "@/lib/supabase/server";

export const maxDuration = 120;

const body = z.object({
  id: z.string().optional(),
  messages: z.array(z.custom<UIMessage>()),
  personId: z.string().uuid().nullish(),
});

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!aiConfigured()) return NextResponse.json({ error: "OPENROUTER_API_KEY is not configured" }, { status: 400 });
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { id, messages, personId } = parsed.data;
  const ownerId = user.id;

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

  const result = streamText({
    model: aiModel(),
    system,
    messages: await convertToModelMessages(messages),
    tools: networkTools(ownerId),
    stopWhen: stepCountIs(8),
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
