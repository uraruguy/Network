import { withOwner, parseBody, notFound } from "@/lib/api-server";
import { deleteCategory, updateCategory } from "@/lib/data/categories";
import { categoryInput } from "@/lib/schemas";

export const PATCH = withOwner<{ id: string }>(async ({ ownerId, params, req }) => (await updateCategory(ownerId, params.id, await parseBody(req, categoryInput.partial()))) ?? notFound());
export const DELETE = withOwner<{ id: string }>(async ({ ownerId, params }) => {
  await deleteCategory(ownerId, params.id);
  return { ok: true };
});
