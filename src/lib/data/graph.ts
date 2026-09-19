import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const { people, notes, noteMentions } = schema;

export type GraphNode = {
  id: string;
  name: string;
  avatarUrl: string | null;
  warmth: schema.Warmth;
  circle: schema.Circle | null;
  categoryIds: string[];
  notes: number;
  location: string | null;
  countryCode: string | null;
};
export type GraphLink = { source: string; target: string; kind: "introduced" | "mention" | "met"; weight: number };

export async function graphData(ownerId: string) {
  const rows = await db.query.people.findMany({
    where: and(eq(people.ownerId, ownerId), isNull(people.deletedAt)),
    columns: { id: true, displayName: true, avatarUrl: true, warmth: true, circle: true, introducedById: true },
    with: { homeLocation: { columns: { name: true, countryCode: true } }, categories: { columns: { categoryId: true } } },
  });
  const ids = rows.map((r) => r.id);
  if (!ids.length) return { nodes: [] as GraphNode[], links: [] as GraphLink[] };

  const noteCounts = await db
    .select({ personId: notes.personId, n: sql<number>`count(*)::int` })
    .from(notes)
    .where(and(eq(notes.ownerId, ownerId), isNull(notes.deletedAt), inArray(notes.personId, ids)))
    .groupBy(notes.personId);
  const countBy = new Map(noteCounts.map((c) => [c.personId, c.n]));

  const nodes: GraphNode[] = rows.map((r) => ({
    id: r.id,
    name: r.displayName,
    avatarUrl: r.avatarUrl,
    warmth: r.warmth,
    circle: r.circle,
    categoryIds: r.categories.map((c) => c.categoryId),
    notes: countBy.get(r.id) ?? 0,
    location: r.homeLocation?.name ?? null,
    countryCode: r.homeLocation?.countryCode ?? null,
  }));

  const links: GraphLink[] = [];
  const idSet = new Set(ids);
  for (const r of rows) {
    if (r.introducedById && idSet.has(r.introducedById)) links.push({ source: r.introducedById, target: r.id, kind: "introduced", weight: 2 });
    else links.push({ source: "me", target: r.id, kind: "met", weight: 1 });
  }

  // Co-mentions: a note about A that mentions B links A—B.
  const mentions = await db
    .select({ a: notes.personId, b: noteMentions.personId })
    .from(noteMentions)
    .innerJoin(notes, eq(notes.id, noteMentions.noteId))
    .where(and(eq(noteMentions.ownerId, ownerId), isNull(notes.deletedAt)));
  const pair = new Map<string, number>();
  for (const m of mentions) {
    if (m.a === m.b || !idSet.has(m.a) || !idSet.has(m.b)) continue;
    const key = [m.a, m.b].sort().join("|");
    pair.set(key, (pair.get(key) ?? 0) + 1);
  }
  for (const [key, n] of pair) {
    const [a, b] = key.split("|") as [string, string];
    links.push({ source: a, target: b, kind: "mention", weight: n });
  }
  return { nodes, links };
}
