import { parseBody, withOwner } from "@/lib/api-server";
import { reorderCategories } from "@/lib/data/categories";
import { reorderInput } from "@/lib/schemas";

/** POST {ids: [...]} — new display order of categories → rows with live-people counts. */
export const POST = withOwner(async ({ ownerId, req }) => reorderCategories(ownerId, (await parseBody(req, reorderInput)).ids));
