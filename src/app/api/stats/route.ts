import { withOwner } from "@/lib/api-server";
import { getStats } from "@/lib/data/profile";

/** → {people, cities, dueToday, overdue, upcoming7d}; "today" is in the profile's timezone. */
export const GET = withOwner(async ({ ownerId }) => getStats(ownerId));
