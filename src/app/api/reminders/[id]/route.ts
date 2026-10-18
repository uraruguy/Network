import { notFound, parseBody, withOwner } from "@/lib/api-server";
import { completeReminder, deleteReminder, rescheduleReminder, snoozeReminder, updateReminder } from "@/lib/data/reminders";
import { reminderAction } from "@/lib/schemas";

/** PATCH {action:"done"} | {action:"snooze", days} | {action:"reschedule", dueAt} | {action:"update", dueAt?, message?, recurrence?, recurrenceDays?} → reminder. */
export const PATCH = withOwner<{ id: string }>(async ({ ownerId, params, req }) => {
  const body = await parseBody(req, reminderAction);
  const r =
    body.action === "done"
      ? await completeReminder(ownerId, params.id)
      : body.action === "snooze"
        ? await snoozeReminder(ownerId, params.id, body.days)
        : body.action === "reschedule"
          ? await rescheduleReminder(ownerId, params.id, new Date(body.dueAt))
          : await updateReminder(ownerId, params.id, { ...body, dueAt: body.dueAt ? new Date(body.dueAt) : undefined });
  return r ?? notFound();
});

export const DELETE = withOwner<{ id: string }>(async ({ ownerId, params }) => {
  await deleteReminder(ownerId, params.id);
  return { ok: true };
});
