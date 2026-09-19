import { z } from "zod";
import { withOwner, parseBody, HttpError } from "@/lib/api-server";
import { aiConfigured } from "@/lib/ai/provider";
import { addInbox, listInbox, triageInbox } from "@/lib/data/inbox";

export const maxDuration = 60;

export const GET = withOwner(async ({ ownerId }) => listInbox(ownerId));

/** Quick capture from inside the app: save + triage in one go. */
export const POST = withOwner(async ({ ownerId, req }) => {
  const { text } = await parseBody(req, z.object({ text: z.string().trim().min(1).max(20000) }));
  const item = await addInbox(ownerId, text, "app");
  if (!aiConfigured()) throw new HttpError(400, "OPENROUTER_API_KEY is not configured");
  return triageInbox(ownerId, item.id);
});
