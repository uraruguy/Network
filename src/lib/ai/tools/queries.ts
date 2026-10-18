import "server-only";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { EXCERPT_LENGTH } from "@/lib/data/people";

/**
 * Small, tool-specific reads that the shared data layer has no reason to carry. Everything is
 * scoped to `ownerId` and to live (not deleted) rows.
 */

const { locations, notes, people } = schema;

const folded = (col: unknown) => sql`private.f_unaccent(lower(${col}))`;

/** The owner's home-location ids whose city name matches (accent/case-insensitive), optionally within a country. */
export async function locationIdsForCity(ownerId: string, city: string, countryCode?: string | null): Promise<{ id: string; name: string; country: string }[]> {
  const text = city.trim();
  if (!text) return [];
  return db
    .select({ id: locations.id, name: locations.name, country: locations.country })
    .from(locations)
    .where(
      and(
        eq(locations.ownerId, ownerId),
        sql`${folded(locations.name)} = ${folded(sql`${text}::text`)}`,
        countryCode ? sql`upper(${locations.countryCode}) = ${countryCode.toUpperCase()}` : undefined,
      ),
    )
    .limit(10);
}

/** ISO country code for a country name (or code) among the owner's locations. */
export async function countryCodeFor(ownerId: string, country: string): Promise<string | null> {
  const text = country.trim();
  if (!text) return null;
  const [row] = await db
    .selectDistinct({ code: locations.countryCode })
    .from(locations)
    .where(
      and(
        eq(locations.ownerId, ownerId),
        sql`(${folded(locations.country)} = ${folded(sql`${text}::text`)} or upper(${locations.countryCode}) = upper(${text}))`,
      ),
    )
    .limit(1);
  if (row?.code) return row.code.toUpperCase();
  return /^[a-z]{2}$/i.test(text) ? text.toUpperCase() : null;
}

export type InteractionRow = {
  noteId: string;
  personId: string;
  personName: string;
  title: string | null;
  kind: string;
  occurredAt: Date;
  excerpt: string;
};

/** Notes (interactions) in the last `days`, newest first, optionally for one person / of one kind. */
export async function recentNotesIn(
  ownerId: string,
  opts: { days: number; personId?: string; kind?: string; limit: number },
): Promise<InteractionRow[]> {
  const since = new Date(Date.now() - opts.days * 86_400_000);
  return db
    .select({
      noteId: notes.id,
      personId: notes.personId,
      personName: people.displayName,
      title: notes.title,
      kind: notes.kind,
      occurredAt: notes.occurredAt,
      excerpt: sql<string>`left(${notes.contentText}, ${EXCERPT_LENGTH})`,
    })
    .from(notes)
    .innerJoin(people, eq(people.id, notes.personId))
    .where(
      and(
        eq(notes.ownerId, ownerId),
        isNull(notes.deletedAt),
        isNull(people.deletedAt),
        gte(notes.occurredAt, since),
        opts.personId ? eq(notes.personId, opts.personId) : undefined,
        opts.kind ? sql`${notes.kind} = ${opts.kind}` : undefined,
      ),
    )
    .orderBy(desc(notes.occurredAt))
    .limit(opts.limit);
}
