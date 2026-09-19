import { withOwner, parseBody } from "@/lib/api-server";
import { createPerson, listPeople } from "@/lib/data/people";
import { personInput } from "@/lib/schemas";
import type { Warmth } from "@/lib/db/schema";

export const GET = withOwner(async ({ ownerId, url }) => {
  const q = url.searchParams.get("q") ?? undefined;
  const categoryId = url.searchParams.get("category") ?? undefined;
  const warmth = (url.searchParams.get("warmth") as Warmth | null) ?? undefined;
  const countryCode = url.searchParams.get("country") ?? undefined;
  return listPeople(ownerId, { q, categoryId, warmth, countryCode });
});

export const POST = withOwner(async ({ ownerId, req }) => {
  const input = await parseBody(req, personInput);
  return createPerson(ownerId, input);
});
