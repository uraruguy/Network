import { parseBody, withOwner } from "@/lib/api-server";
import { reorderActivities } from "@/lib/data/activities";
import { reorderInput } from "@/lib/schemas";

/** POST {ids: [...]} — new display order → ActivityRow[]. */
export const POST = withOwner(async ({ ownerId, req }) => reorderActivities(ownerId, (await parseBody(req, reorderInput)).ids));
