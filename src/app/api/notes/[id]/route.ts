import { NextResponse } from "next/server";
import { HttpError, NO_STORE, notFound, parseBody, withOwner } from "@/lib/api-server";
import { deleteNote, getNote, updateNote, upsertNote, type NoteWriteResult } from "@/lib/data/notes";
import { notePatch, noteUpsert } from "@/lib/schemas";

function respond(result: NoteWriteResult) {
  switch (result.status) {
    case "ok":
      return NextResponse.json(result.note, { status: result.created ? 201 : 200 });
    case "deleted":
      // Clearing a note deletes it, as in the app; the last words are kept for a restore.
      return result.note;
    case "conflict":
      return NextResponse.json(
        { error: "conflict", message: "This note was changed elsewhere since this version was opened", note: result.note },
        { status: 409, headers: { "cache-control": NO_STORE } },
      );
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
 * Creating needs `personId` and some words (422). 410 if the note was deleted (unless
 * `restore: true`); 409 `{ error: "conflict", note }` when `baseVersions` no longer match the
 * stored content; 409 `duplicate` when restoring an imported note that was imported again. A
 * write that leaves the note without words soft-deletes it (200, `deletedAt` set).
 */
export const PUT = withOwner<{ id: string }>(async ({ ownerId, params, req }) => respond(await upsertNote(ownerId, params.id, await parseBody(req, noteUpsert))));

/** Partial update → NoteDetail. `personId` moves the note to another person. 410 if deleted; blanking soft-deletes. */
export const PATCH = withOwner<{ id: string }>(async ({ ownerId, params, req }) => respond(await updateNote(ownerId, params.id, await parseBody(req, notePatch))));

/** Soft delete (undo with POST /api/notes/[id]/restore). Idempotent. */
export const DELETE = withOwner<{ id: string }>(async ({ ownerId, params }) => {
  await deleteNote(ownerId, params.id);
  return { ok: true };
});
