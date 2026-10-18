import { z } from "zod";
import { parseQuery, withOwner } from "@/lib/api-server";
import { peopleFilterQuery, filtersFromQuery } from "@/lib/data/people-filters";
import { searchPeople } from "@/lib/data/people";

const query = peopleFilterQuery.extend({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().max(500).optional(),
});

/**
 * GET ?q=&category=&tag=&activity=&warmth=&circle=&country=&location=&lastContactBefore=&limit=&cursor=
 * → { items: PersonIndexRow[] (+score when q), nextCursor: string | null }
 * Lists accept comma-separated or repeated values; category/tag/activity match ANY.
 */
export const GET = withOwner(async ({ ownerId, url }) => {
  const q = parseQuery(url, query);
  return searchPeople(ownerId, filtersFromQuery(q), { limit: q.limit, cursor: q.cursor });
});
