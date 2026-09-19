import { withOwner, parseBody } from "@/lib/api-server";
import { createNote, recentNotes, searchNotes } from "@/lib/data/notes";
import { noteInput } from "@/lib/schemas";

export const GET = withOwner(async ({ ownerId, url }) => {
  const q = url.searchParams.get("q");
  if (q) return searchNotes(ownerId, q);
  return recentNotes(ownerId, Number(url.searchParams.get("limit") ?? 10));
});

export const POST = withOwner(async ({ ownerId, req }) => createNote(ownerId, await parseBody(req, noteInput)));
