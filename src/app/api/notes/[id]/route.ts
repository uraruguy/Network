import { withOwner, parseBody, notFound } from "@/lib/api-server";
import { deleteNote, getNote, updateNote } from "@/lib/data/notes";
import { notePatch } from "@/lib/schemas";

export const GET = withOwner<{ id: string }>(async ({ ownerId, params }) => (await getNote(ownerId, params.id)) ?? notFound());
export const PATCH = withOwner<{ id: string }>(async ({ ownerId, params, req }) => (await updateNote(ownerId, params.id, await parseBody(req, notePatch))) ?? notFound());
export const DELETE = withOwner<{ id: string }>(async ({ ownerId, params }) => {
  await deleteNote(ownerId, params.id);
  return { ok: true };
});
