import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, parseBody, parseQuery, withOwner } from "@/lib/api-server";
import { createNote, recentNotes, searchNotes } from "@/lib/data/notes";
import { isBlankNote } from "@/lib/notes/write-rules";
import { noteInput } from "@/lib/schemas";

const query = z.object({
  q: z.string().trim().max(200).optional(),
  person: z.string().uuid().optional(),
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/**
 * GET ?q=…[&person=&since=&until=&limit=] → NoteSearchHit[] (ranked, `snippet` with **highlights**)
 * GET ?limit=10                            → recent notes (excerpt + person), most recently edited first
 */
export const GET = withOwner(async ({ ownerId, url }) => {
  const q = parseQuery(url, query);
  if (q.q) return searchNotes(ownerId, { query: q.q, personId: q.person, since: q.since, until: q.until, limit: q.limit });
  return recentNotes(ownerId, q.limit ?? 10);
});

/**
 * Create → NoteDetail (201); 422 for a note without words (never stored). Prefer
 * PUT /api/notes/[id] with a client-generated id for offline use.
 */
export const POST = withOwner(async ({ ownerId, req }) => {
  const input = await parseBody(req, noteInput);
  if (isBlankNote(input)) throw new HttpError(422, "A note needs a title or some text");
  return NextResponse.json(await createNote(ownerId, input), { status: 201 });
});
