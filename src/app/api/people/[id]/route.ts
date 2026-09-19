import { withOwner, parseBody, notFound } from "@/lib/api-server";
import { deletePerson, getPerson, updatePerson } from "@/lib/data/people";
import { personPatch } from "@/lib/schemas";

export const GET = withOwner<{ id: string }>(async ({ ownerId, params }) => (await getPerson(ownerId, params.id)) ?? notFound());

export const PATCH = withOwner<{ id: string }>(async ({ ownerId, params, req }) => {
  const patch = await parseBody(req, personPatch);
  return (await updatePerson(ownerId, params.id, patch)) ?? notFound();
});

export const DELETE = withOwner<{ id: string }>(async ({ ownerId, params }) => {
  await deletePerson(ownerId, params.id);
  return { ok: true };
});
