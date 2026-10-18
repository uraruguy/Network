import { NextResponse } from "next/server";
import { parseBody, withOwner } from "@/lib/api-server";
import { createPersonIdempotent, listPeopleIndex } from "@/lib/data/people";
import { personInput } from "@/lib/schemas";

/**
 * GET  → PersonIndexRow[]: every live person, compact, most recently in touch first. The client
 *        caches this whole list and filters locally; use /api/people/search for server-side filters.
 */
export const GET = withOwner(async ({ ownerId }) => listPeopleIndex(ownerId));

/**
 * POST → PersonDetail. 201 when created, 200 when a client-generated `id` already exists for this
 * owner (idempotent replay), 409 when the id is taken otherwise.
 */
export const POST = withOwner(async ({ ownerId, req }) => {
  const { person, created } = await createPersonIdempotent(ownerId, await parseBody(req, personInput));
  return NextResponse.json(person, { status: created ? 201 : 200 });
});
