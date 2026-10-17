import { notFound, parseBody, withOwner } from "@/lib/api-server";
import { completeReminder, deleteReminder, rescheduleReminder, snoozeReminder } from "@/lib/data/reminders";
import { reminderAction } from "@/lib/schemas";

/** PATCH {action:"done"} | {action:"snooze", days} | {action:"reschedule", dueAt} → reminder. */
export const PATCH = withOwner<{ id: string }>(async ({ ownerId, params, req }) => {
  const body = await parseBody(req, reminderAction);
  const r =
    body.action === "done"
      ? await completeReminder(ownerId, params.id)
      : body.action === "snooze"
        ? await snoozeReminder(ownerId, params.id, body.days)
        : await rescheduleReminder(ownerId, params.id, new Date(body.dueAt));
  return r ?? notFound();
});

export const DELETE = withOwner<{ id: string }>(async ({ ownerId, params }) => {
  await deleteReminder(ownerId, params.id);
  return { ok: true };
});
