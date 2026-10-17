import { inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { CIRCLES, WARMTH, type Circle, type Warmth } from "@/lib/constants";
import { locations, people, personActivities, personCategories, personTags } from "@/lib/db/schema";
import { likePattern, toTsQuery } from "./search-query";

/**
 * SQL building blocks for filtering people. Pure (no database access), so the generated SQL can be
 * unit-tested with drizzle's dialect. Used by the people search, the globe and the graph.
 */

export type PeopleFilters = {
  /** Free text: full-text over name/company/headline/context + fuzzy, accent-insensitive name match. */
  q?: string;
  /** Person has ANY of these categories / tags / activities. */
  categoryIds?: string[];
  tagIds?: string[];
  activityIds?: string[];
  warmth?: Warmth[];
  circle?: Circle[];
  /** ISO 3166-1 alpha-2 of the home location. */
  countryCode?: string;
  locationId?: string;
  /** Not in touch since this date (no interaction recorded, or the last one is older). */
  lastContactBefore?: Date;
};

const idList = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(",")).map((s) => s.trim()).filter(Boolean))
  .pipe(z.array(z.string().uuid()).max(100));
const enumList = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(",")).map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)));

/**
 * Query-string schema shared by /api/people/search, /api/globe and /api/graph.
 * Lists accept repeated keys or comma-separated values: `?category=a,b&tag=c`.
 */
export const peopleFilterQuery = z.object({
  q: z.string().trim().max(200).optional(),
  category: idList.optional(),
  tag: idList.optional(),
  activity: idList.optional(),
  warmth: enumList(WARMTH).optional(),
  circle: enumList(CIRCLES).optional(),
  country: z.string().trim().length(2).optional(),
  location: z.string().uuid().optional(),
  lastContactBefore: z.coerce.date().optional(),
});

export function filtersFromQuery(q: z.output<typeof peopleFilterQuery>): PeopleFilters {
  return {
    q: q.q || undefined,
    categoryIds: q.category,
    tagIds: q.tag,
    activityIds: q.activity,
    warmth: q.warmth,
    circle: q.circle,
    countryCode: q.country,
    locationId: q.location,
    lastContactBefore: q.lastContactBefore,
  };
}

const foldedName = sql`private.f_unaccent(lower(${people.displayName}))`;

/** WHERE conditions (AND-ed by the caller). Always scoped to the owner and to live people. */
export function peopleConditions(ownerId: string, f: PeopleFilters = {}): SQL[] {
  const c: SQL[] = [sql`${people.ownerId} = ${ownerId}`, sql`${people.deletedAt} is null`];

  const text = f.q?.trim();
  if (text) {
    const tsq = toTsQuery(text);
    c.push(
      or(
        tsq ? sql`${people.search} @@ to_tsquery('public.network', ${tsq})` : undefined,
        sql`${foldedName} like private.f_unaccent(lower(${likePattern(text)}))`,
        sql`${foldedName} % private.f_unaccent(lower(${text}))`,
      )!,
    );
  }
  if (f.categoryIds?.length) {
    c.push(sql`exists (select 1 from ${personCategories} where ${personCategories.personId} = ${people.id} and ${inArray(personCategories.categoryId, f.categoryIds)})`);
  }
  if (f.tagIds?.length) {
    c.push(sql`exists (select 1 from ${personTags} where ${personTags.personId} = ${people.id} and ${inArray(personTags.tagId, f.tagIds)})`);
  }
  if (f.activityIds?.length) {
    c.push(sql`exists (select 1 from ${personActivities} where ${personActivities.personId} = ${people.id} and ${inArray(personActivities.activityId, f.activityIds)})`);
  }
  if (f.warmth?.length) c.push(inArray(people.warmth, f.warmth));
  if (f.circle?.length) c.push(inArray(people.circle, f.circle));
  if (f.countryCode) {
    c.push(sql`exists (select 1 from ${locations} where ${locations.id} = ${people.homeLocationId} and upper(${locations.countryCode}) = ${f.countryCode.toUpperCase()})`);
  }
  if (f.locationId) c.push(sql`${people.homeLocationId} = ${f.locationId}`);
  if (f.lastContactBefore) {
    c.push(sql`(${people.lastInteractionAt} is null or ${people.lastInteractionAt} < ${f.lastContactBefore.toISOString()}::timestamptz)`);
  }
  return c;
}

/** Relevance of a person for free text: full-text rank + name similarity. */
export function relevance(text: string): SQL<number> {
  const tsq = toTsQuery(text);
  const rank = tsq ? sql`ts_rank(${people.search}, to_tsquery('public.network', ${tsq}))` : sql`0`;
  return sql<number>`(${rank} + similarity(${foldedName}, private.f_unaccent(lower(${text}))))`.mapWith(Number);
}

/** Sort key of the default "most recently in touch" order. */
export const recencyKey = sql`coalesce(${people.lastInteractionAt}, ${people.createdAt})`;

/* ------------------------------------------------------------------ */
/*  Cursors                                                            */
/* ------------------------------------------------------------------ */

/**
 * Opaque pagination cursors (base64url JSON).
 * - recency order: keyset on (recency key desc, id asc); the key is Postgres' full-precision text
 * - relevance order: offset (ranks are floats; keyset on them is brittle)
 */
export type PeopleCursor = { k: "recent"; t: string; id: string } | { k: "rank"; o: number };

const cursorSchema = z.union([
  z.object({ k: z.literal("recent"), t: z.string().min(1).max(64), id: z.string().uuid() }),
  z.object({ k: z.literal("rank"), o: z.number().int().min(0).max(100_000) }),
]);

export function encodeCursor(c: PeopleCursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

export function decodeCursor(raw: string | null | undefined): PeopleCursor | null {
  if (!raw) return null;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Keyset condition for the page after `cursor` in recency order. */
export function afterRecencyCursor(cursor: { t: string; id: string }): SQL {
  return sql`(${recencyKey} < ${cursor.t}::timestamptz or (${recencyKey} = ${cursor.t}::timestamptz and ${people.id} > ${cursor.id}))`;
}
