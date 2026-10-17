import { withOwner } from "@/lib/api-server";
import { listTags } from "@/lib/data/tags";

/** → TagRow[] ({id, name, color, count}), alphabetical. Tags are created via a person's `tagNames`. */
export const GET = withOwner(async ({ ownerId }) => listTags(ownerId));
