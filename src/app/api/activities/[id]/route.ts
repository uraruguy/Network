import { HttpError, notFound, parseBody, withOwner } from "@/lib/api-server";
import { deleteActivity, updateActivity } from "@/lib/data/activities";
import { activityPatch } from "@/lib/schemas";

/** Rename / emoji / sort → ActivityRow. 409 if another activity has the name. */
export const PATCH = withOwner<{ id: string }>(async ({ ownerId, params, req }) => {
  const result = await updateActivity(ownerId, params.id, await parseBody(req, activityPatch));
  if (result.status === "ok") return result.activity;
  if (result.status === "conflict") throw new HttpError(409, result.message);
  if (result.status === "invalid") throw new HttpError(422, result.message);
  notFound();
});

/** Deletes the activity and unlinks it from everyone. */
export const DELETE = withOwner<{ id: string }>(async ({ ownerId, params }) => {
  if (!(await deleteActivity(ownerId, params.id))) notFound();
  return { ok: true };
});
