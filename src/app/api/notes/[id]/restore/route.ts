import { notFound, withOwner } from "@/lib/api-server";
import { restoreNote } from "@/lib/data/notes";

/** Undoes a soft delete → NoteDetail. 409 `duplicate` when an imported note was imported again since. */
export const POST = withOwner<{ id: string }>(async ({ ownerId, params }) => (await restoreNote(ownerId, params.id)) ?? notFound());
