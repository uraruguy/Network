import { notFound, withOwner } from "@/lib/api-server";
import { restorePerson } from "@/lib/data/people";

/** Undoes a soft delete → PersonDetail. */
export const POST = withOwner<{ id: string }>(async ({ ownerId, params }) => (await restorePerson(ownerId, params.id)) ?? notFound());
