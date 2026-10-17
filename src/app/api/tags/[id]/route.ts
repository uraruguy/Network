import { NextResponse } from "next/server";
import { notFound, parseBody, withOwner } from "@/lib/api-server";
import { deleteTag, updateTag } from "@/lib/data/tags";
import { tagPatch } from "@/lib/schemas";

/** Rename / recolour → TagRow. 409 {error:"conflict", existingId} if the name is taken (merge instead). */
export const PATCH = withOwner<{ id: string }>(async ({ ownerId, params, req }) => {
  const result = await updateTag(ownerId, params.id, await parseBody(req, tagPatch));
  if (result.status === "ok") return result.tag;
  if (result.status === "conflict") {
    return NextResponse.json({ error: "conflict", message: result.message, existingId: result.existingId }, { status: 409 });
  }
  notFound();
});

export const DELETE = withOwner<{ id: string }>(async ({ ownerId, params }) => {
  if (!(await deleteTag(ownerId, params.id))) notFound();
  return { ok: true };
});
