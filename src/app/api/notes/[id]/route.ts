import { NextResponse } from "next/server";
import { HttpError, notFound, parseBody, withOwner } from "@/lib/api-server";
import { deleteNote, getNote, updateNote, upsertNote, type NoteWriteResult } from "@/lib/data/notes";
import { notePatch, noteUpsert } from "@/lib/schemas";

function respond(result: NoteWriteResult) {
  switch (result.status) {
    case "ok":
      return NextResponse.json(result.note, { status: result.created ? 201 : 200 });
    case "gone":
      throw new HttpError(410, "This note was deleted; send restore: true to bring it back");
    case "invalid":
      throw new HttpError(422, result.message);
    default:
      notFound();
  }
}

export const GET = withOwner<{ id: string }>(async ({ ownerId, params }) => (await getNote(ownerId, params.id)) ?? notFound());

/**
 * Idempotent create-or-update with a client-generated id → NoteDetail (201 created / 200 updated).
 * `personId` is required to create; 410 if the note was deleted (unless `restore: true`).
 */
export const PUT = withOwner<{ id: string }>(async ({ ownerId, params, req }) => respond(await upsertNote(ownerId, params.id, await parseBody(req, noteUpsert))));

/** Partial update → NoteDetail. `personId` moves the note to another person. 410 if deleted. */
export const PATCH = withOwner<{ id: string }>(async ({ ownerId, params, req }) => respond(await updateNote(ownerId, params.id, await parseBody(req, notePatch))));

/** Soft delete (undo with POST /api/notes/[id]/restore). Idempotent. */
export const DELETE = withOwner<{ id: string }>(async ({ ownerId, params }) => {
  await deleteNote(ownerId, params.id);
  return { ok: true };
});
