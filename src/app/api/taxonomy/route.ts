import { withOwner } from "@/lib/api-server";
import { listTaxonomy } from "@/lib/data/tags";

/** → {categories, tags, activities}, each row with a live-people `count`. */
export const GET = withOwner(async ({ ownerId }) => listTaxonomy(ownerId));
