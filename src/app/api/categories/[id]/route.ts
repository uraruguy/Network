import { notFound, parseBody, withOwner } from "@/lib/api-server";
import { deleteCategory, updateCategory } from "@/lib/data/categories";
import { categoryPatch } from "@/lib/schemas";

export const PATCH = withOwner<{ id: string }>(async ({ ownerId, params, req }) => (await updateCategory(ownerId, params.id, await parseBody(req, categoryPatch))) ?? notFound());

export const DELETE = withOwner<{ id: string }>(async ({ ownerId, params }) => {
  if (!(await deleteCategory(ownerId, params.id))) notFound();
  return { ok: true };
});
