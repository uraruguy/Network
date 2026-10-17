import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { qcol } from "./sql";
import { peopleConditions, type PeopleFilters } from "./people-filters";

const { people, notes, noteMentions, locations, personCategories, personActivities, personTags } = schema;

export type GraphNode = {
  id: string;
  name: string;
  avatarUrl: string | null;
  warmth: schema.Warmth;
  circle: schema.Circle | null;
  categoryIds: string[];
  /** Always present in API responses (optional only so client-made nodes like "me" type-check). */
  activityIds?: string[];
  tagIds?: string[];
  notes: number;
  location: string | null;
  countryCode: string | null;
};
export type GraphLink = { source: string; target: string; kind: "introduced" | "mention" | "met"; weight: number };

/**
 * Relationship graph: introductions ("A introduced B"), co-mentions (a note about A mentions B)
 * and "met directly" links to the owner ("me"). Accepts the shared people filters; links only
 * connect people that pass them.
 */
export async function graphData(ownerId: string, filters: PeopleFilters = {}) {
  const [rows, mentions] = await Promise.all([
    db
      .select({
        id: people.id,
        name: people.displayName,
        avatarUrl: people.avatarUrl,
        warmth: people.warmth,
        circle: people.circle,
        introducedById: people.introducedById,
        location: locations.name,
        countryCode: locations.countryCode,
        categoryIds: sql<string[]>`array(select category_id::text from ${personCategories} where person_id = ${qcol(people.id)})`,
        activityIds: sql<string[]>`array(select activity_id::text from ${personActivities} where person_id = ${qcol(people.id)})`,
        tagIds: sql<string[]>`array(select tag_id::text from ${personTags} where person_id = ${qcol(people.id)})`,
        notes: sql<number>`(select count(*)::int from notes n where n.person_id = ${qcol(people.id)} and n.deleted_at is null)`,
      })
      .from(people)
      .leftJoin(locations, eq(locations.id, people.homeLocationId))
      .where(and(...peopleConditions(ownerId, filters))),
    db
      .select({ a: notes.personId, b: noteMentions.personId })
      .from(noteMentions)
      .innerJoin(notes, eq(notes.id, noteMentions.noteId))
      .where(and(eq(noteMentions.ownerId, ownerId), eq(notes.ownerId, ownerId), isNull(notes.deletedAt))),
  ]);
  if (!rows.length) return { nodes: [] as GraphNode[], links: [] as GraphLink[] };

  const nodes: GraphNode[] = rows.map(({ introducedById: _i, ...r }) => r);
  const ids = new Set(rows.map((r) => r.id));
  const links: GraphLink[] = [];
  for (const r of rows) {
    if (r.introducedById && ids.has(r.introducedById)) links.push({ source: r.introducedById, target: r.id, kind: "introduced", weight: 2 });
    else links.push({ source: "me", target: r.id, kind: "met", weight: 1 });
  }

  const pair = new Map<string, number>();
  for (const m of mentions) {
    if (m.a === m.b || !ids.has(m.a) || !ids.has(m.b)) continue;
    const key = [m.a, m.b].sort().join("|");
    pair.set(key, (pair.get(key) ?? 0) + 1);
  }
  for (const [key, n] of pair) {
    const [a, b] = key.split("|") as [string, string];
    links.push({ source: a, target: b, kind: "mention", weight: n });
  }
  return { nodes, links };
}
