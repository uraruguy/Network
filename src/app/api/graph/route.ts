import { parseQuery, withOwner } from "@/lib/api-server";
import { graphData } from "@/lib/data/graph";
import { filtersFromQuery, peopleFilterQuery } from "@/lib/data/people-filters";

/** GET [?category=&activity=&tag=&warmth=…] → {nodes, links}. */
export const GET = withOwner(async ({ ownerId, url }) => graphData(ownerId, filtersFromQuery(parseQuery(url, peopleFilterQuery))));
