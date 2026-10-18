import { notFound, parseBody, withOwner } from "@/lib/api-server";
import { deletePerson, getPerson, updatePerson } from "@/lib/data/people";
import { personPatch } from "@/lib/schemas";

/** → PersonDetail (notes as excerpts, first page; see /api/people/[id]/notes). */
export const GET = withOwner<{ id: string }>(async ({ ownerId, params }) => (await getPerson(ownerId, params.id)) ?? notFound());

/** Partial update → PersonDetail. Accepts `activityIds`, `tagNames` (created as needed) and legacy `hobbies`. */
export const PATCH = withOwner<{ id: string }>(async ({ ownerId, params, req }) => {
  const patch = await parseBody(req, personPatch);
  return (await updatePerson(ownerId, params.id, patch)) ?? notFound();
});

/**
 * Soft delete (undo with POST /api/people/[id]/restore). Idempotent like notes and reminders: a
 * retried delete whose first response was lost (offline queue) succeeds instead of 404-ing.
 */
export const DELETE = withOwner<{ id: string }>(async ({ ownerId, params }) => {
  await deletePerson(ownerId, params.id);
  return { ok: true };
});
