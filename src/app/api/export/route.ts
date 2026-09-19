import { and, eq, isNull } from "drizzle-orm";
import { withOwner } from "@/lib/api-server";
import { db, schema } from "@/lib/db";

/** Full JSON export of everything the owner has — the data is theirs. */
export const GET = withOwner(async ({ ownerId }) => {
  const [people, notes, reminders, categories, locations, tags] = await Promise.all([
    db.query.people.findMany({ where: and(eq(schema.people.ownerId, ownerId), isNull(schema.people.deletedAt)), with: { categories: { columns: { categoryId: true } }, tags: { columns: { tagId: true } } } }),
    db.query.notes.findMany({ where: and(eq(schema.notes.ownerId, ownerId), isNull(schema.notes.deletedAt)), with: { mentions: { columns: { personId: true } } } }),
    db.query.reminders.findMany({ where: eq(schema.reminders.ownerId, ownerId) }),
    db.query.categories.findMany({ where: eq(schema.categories.ownerId, ownerId) }),
    db.query.locations.findMany({ where: eq(schema.locations.ownerId, ownerId) }),
    db.query.tags.findMany({ where: eq(schema.tags.ownerId, ownerId) }),
  ]);
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), version: 1, categories, locations, tags, people, notes, reminders }, null, 2);
  return new Response(body, {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="the-network-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
