import { z } from "zod";
import { withOwner, parseBody } from "@/lib/api-server";
import { addInbox, listInbox, triageInbox } from "@/lib/data/inbox";
import { withOwnerAi } from "@/app/api/import/_lib/http";

export const maxDuration = 60;

export const GET = withOwner(async ({ ownerId }) => listInbox(ownerId));

/** Quick capture from inside the app: save + triage in one go (saved even when AI isn't configured). */
export const POST = withOwner(async ({ ownerId, req }) => {
  const { text } = await parseBody(req, z.object({ text: z.string().trim().min(1).max(20000) }));
  const item = await addInbox(ownerId, text, "app");
  return withOwnerAi(ownerId, () => triageInbox(ownerId, item.id));
});
