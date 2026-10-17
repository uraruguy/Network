import { NextResponse } from "next/server";
import { HttpError, parseBody, withOwner } from "@/lib/api-server";
import { createActivity, listActivities } from "@/lib/data/activities";
import { activityInput } from "@/lib/schemas";

/** → ActivityRow[] ({id, name, slug, emoji, sort, count}) in display order. */
export const GET = withOwner(async ({ ownerId }) => listActivities(ownerId));

/** Create (idempotent by name or client `id`) → ActivityRow (201 created / 200 existing). */
export const POST = withOwner(async ({ ownerId, req }) => {
  const result = await createActivity(ownerId, await parseBody(req, activityInput));
  if (result.status === "invalid") throw new HttpError(422, result.message);
  if (result.status !== "ok") throw new HttpError(409, result.status === "conflict" ? result.message : "Conflict");
  return NextResponse.json(result.activity, { status: result.created ? 201 : 200 });
});
