import { withOwner, parseBody } from "@/lib/api-server";
import { createCategory, listCategories } from "@/lib/data/categories";
import { categoryInput } from "@/lib/schemas";

export const GET = withOwner(async ({ ownerId }) => listCategories(ownerId));
export const POST = withOwner(async ({ ownerId, req }) => createCategory(ownerId, await parseBody(req, categoryInput)));
