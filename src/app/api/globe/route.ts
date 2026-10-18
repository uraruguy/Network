import { parseQuery, withOwner } from "@/lib/api-server";
import { globeData } from "@/lib/data/people";
import { filtersFromQuery, peopleFilterQuery } from "@/lib/data/people-filters";

/** GET [?category=&activity=&tag=&warmth=…] → [{location, people[]}] grouped by home location. */
export const GET = withOwner(async ({ ownerId, url }) => globeData(ownerId, filtersFromQuery(parseQuery(url, peopleFilterQuery))));
