import { z } from "zod";
import { withOwner, parseBody, notFound } from "@/lib/api-server";
import { completeReminder, deleteReminder, snoozeReminder } from "@/lib/data/reminders";

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("done") }),
  z.object({ action: z.literal("snooze"), days: z.number().int().min(1).max(365) }),
]);

export const PATCH = withOwner<{ id: string }>(async ({ ownerId, params, req }) => {
  const body = await parseBody(req, action);
  const r = body.action === "done" ? await completeReminder(ownerId, params.id) : await snoozeReminder(ownerId, params.id, body.days);
  return r ?? notFound();
});

export const DELETE = withOwner<{ id: string }>(async ({ ownerId, params }) => {
  await deleteReminder(ownerId, params.id);
  return { ok: true };
});
