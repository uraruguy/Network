import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import type { SelectedFields } from "drizzle-orm/pg-core";
import { db, schema, type Tx } from "@/lib/db";
import { qcol } from "./sql";
import { HttpError } from "@/lib/errors";
import type { PersonData, PersonPatchData } from "@/lib/schemas";
import { cleanNames, slugify } from "@/lib/text";
import { upsertLocation } from "./locations";
import { afterRecencyCursor, decodeCursor, encodeCursor, peopleConditions, recencyKey, relevance, type PeopleFilters } from "./people-filters";

const { people, personCategories, personActivities, personTags, locations, categories, activities, tags } = schema;

/** Open (not completed) reminder statuses. */
export const OPEN_REMINDER_STATUSES = ["pending", "sent", "snoozed"] as const;
/** Characters of note text included in summaries. */
export const EXCERPT_LENGTH = 280;
/** Notes embedded in a person's detail (pinned first, then newest); page further with listNotes. */
export const PERSON_NOTES_PAGE = 50;

/* ------------------------------------------------------------------ */
/*  Index: one compact row per person                                  */
/* ------------------------------------------------------------------ */

export type IndexLocation = { id: string; name: string; country: string; countryCode: string | null; lat: number; lng: number; timezone: string | null };

export type PersonIndexRow = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  headline: string | null;
  company: string | null;
  warmth: schema.Warmth;
  circle: schema.Circle | null;
  homeLocation: IndexLocation | null;
  categoryIds: string[];
  activityIds: string[];
  tagIds: string[];
  lastInteractionAt: Date | null;
  nextFollowupAt: Date | null;
  createdAt: Date;
};

const homeLocationJson = sql<IndexLocation | null>`case when ${locations.id} is null then null else json_build_object(
  'id', ${locations.id}, 'name', ${locations.name}, 'country', ${locations.country}, 'countryCode', ${locations.countryCode},
  'lat', ${locations.lat}, 'lng', ${locations.lng}, 'timezone', ${locations.timezone}) end`;

/** Link ids as text[], in the order the UI shows them. */
const categoryIdsSql = sql<string[]>`array(select pc.category_id::text from ${personCategories} pc join ${categories} c on c.id = pc.category_id where pc.person_id = ${qcol(people.id)} order by c.sort, c.name)`;
const activityIdsSql = sql<string[]>`array(select pa.activity_id::text from ${personActivities} pa join ${activities} a on a.id = pa.activity_id where pa.person_id = ${qcol(people.id)} order by a.sort, a.name)`;
const tagIdsSql = sql<string[]>`array(select pt.tag_id::text from ${personTags} pt join ${tags} t on t.id = pt.tag_id where pt.person_id = ${qcol(people.id)} order by lower(t.name))`;

const indexFields = {
  id: people.id,
  displayName: people.displayName,
  avatarUrl: people.avatarUrl,
  headline: people.headline,
  company: people.company,
  warmth: people.warmth,
  circle: people.circle,
  homeLocation: homeLocationJson,
  categoryIds: categoryIdsSql,
  activityIds: activityIdsSql,
  tagIds: tagIdsSql,
  lastInteractionAt: people.lastInteractionAt,
  nextFollowupAt: people.nextFollowupAt,
  createdAt: people.createdAt,
};

function indexQuery<T extends SelectedFields>(extra: T, where: SQL[]) {
  return db
    .select({ ...indexFields, ...extra })
    .from(people)
    .leftJoin(locations, eq(locations.id, people.homeLocationId))
    .where(and(...where));
}

/**
 * Every live person as a compact row, most recently in touch first — one SQL statement.
 * Small enough to cache whole on the client and filter locally (works offline).
 */
export async function listPeopleIndex(ownerId: string): Promise<PersonIndexRow[]> {
  return indexQuery({}, peopleConditions(ownerId)).orderBy(desc(recencyKey), asc(people.id));
}

/**
 * Filtered, paginated people search (AI tools, MCP, server-side filtering).
 * With `q`, results are ranked by relevance (full-text + fuzzy name); otherwise by recency.
 */
export async function searchPeople(
  ownerId: string,
  filters: PeopleFilters,
  opts: { limit?: number; cursor?: string | null } = {},
): Promise<{ items: (PersonIndexRow & { score?: number })[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 50), 1), 200);
  const cursor = decodeCursor(opts.cursor);
  const where = peopleConditions(ownerId, filters);
  const text = filters.q?.trim();

  if (text) {
    const offset = cursor?.k === "rank" ? cursor.o : 0;
    const score = relevance(text);
    const rows = await indexQuery({ score }, where)
      .orderBy(desc(score), desc(recencyKey), asc(people.id))
      .limit(limit + 1)
      .offset(offset);
    return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? encodeCursor({ k: "rank", o: offset + limit }) : null };
  }

  if (cursor?.k === "recent") where.push(afterRecencyCursor(cursor));
  const rows = await indexQuery({ sortKey: sql<string>`${recencyKey}::text` }, where)
    .orderBy(desc(recencyKey), asc(people.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(({ sortKey: _sortKey, ...row }) => row),
    nextCursor: rows.length > limit && last ? encodeCursor({ k: "recent", t: last.sortKey, id: last.id }) : null,
  };
}

/* ------------------------------------------------------------------ */
/*  Detail                                                             */
/* ------------------------------------------------------------------ */

export type PersonDetail = NonNullable<Awaited<ReturnType<typeof getPerson>>>;
export type NoteSummary = PersonDetail["notes"][number];

/**
 * One person with everything the profile page shows — a single SQL statement (drizzle relational
 * query). Notes come as excerpts (first page only; see listNotes) plus the total `notesCount`.
 */
export async function getPerson(ownerId: string, id: string) {
  const row = await db.query.people.findFirst({
    where: and(eq(people.ownerId, ownerId), eq(people.id, id), isNull(people.deletedAt)),
    // v1 hobby columns are stale in v2 (activities replace them); `search` is internal.
    columns: { search: false, hobbies: false, hobbiesOther: false },
    extras: (t, { sql }) => ({
      notesCount: sql<number>`(select count(*)::int from notes n where n.person_id = ${t.id} and n.deleted_at is null)`.as("notes_count"),
    }),
    with: {
      homeLocation: true,
      metLocation: true,
      introducedBy: { columns: { id: true, displayName: true, avatarUrl: true, deletedAt: true } },
      introduced: {
        columns: { id: true, displayName: true, avatarUrl: true, headline: true },
        where: (t, { isNull }) => isNull(t.deletedAt),
        orderBy: (t, { asc }) => asc(t.displayName),
      },
      categories: { columns: {}, with: { category: true } },
      activities: { columns: {}, with: { activity: { columns: { id: true, sort: true, name: true } } } },
      tags: { columns: {}, with: { tag: { columns: { id: true, name: true, color: true } } } },
      notes: {
        columns: { id: true, personId: true, title: true, kind: true, occurredAt: true, pinned: true, updatedAt: true },
        extras: (t, { sql }) => ({ excerpt: sql<string>`left(${t.contentText}, ${EXCERPT_LENGTH})`.as("excerpt") }),
        where: (t, { isNull }) => isNull(t.deletedAt),
        orderBy: (t, { desc }) => [desc(t.pinned), desc(t.occurredAt)],
        limit: PERSON_NOTES_PAGE,
      },
      reminders: {
        where: (t, { inArray }) => inArray(t.status, [...OPEN_REMINDER_STATUSES]),
        orderBy: (t, { asc }) => asc(t.dueAt),
      },
      mentions: {
        columns: {},
        with: {
          note: {
            columns: { id: true, personId: true, title: true, occurredAt: true, deletedAt: true },
            extras: (t, { sql }) => ({ excerpt: sql<string>`left(${t.contentText}, ${EXCERPT_LENGTH})`.as("excerpt") }),
            with: { person: { columns: { id: true, displayName: true, deletedAt: true } } },
          },
        },
      },
    },
  });
  if (!row) return null;

  const { categories: pcs, activities: pas, tags: pts, introducedBy, mentions, ...rest } = row;
  const cats = pcs.map((pc) => pc.category).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const acts = pas.map((pa) => pa.activity).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const tagList = pts.map((pt) => pt.tag).sort((a, b) => a.name.localeCompare(b.name));
  return {
    ...rest,
    introducedBy: introducedBy && !introducedBy.deletedAt ? { id: introducedBy.id, displayName: introducedBy.displayName, avatarUrl: introducedBy.avatarUrl } : null,
    categories: cats,
    categoryIds: cats.map((c) => c.id),
    activityIds: acts.map((a) => a.id),
    tags: tagList,
    tagIds: tagList.map((t) => t.id),
    mentions: mentions
      .filter((m) => !m.note.deletedAt && !m.note.person.deletedAt)
      .sort((a, b) => +new Date(b.note.occurredAt) - +new Date(a.note.occurredAt))
      .slice(0, PERSON_NOTES_PAGE)
      .map((m) => ({
        note: { id: m.note.id, personId: m.note.personId, title: m.note.title, excerpt: m.note.excerpt, occurredAt: m.note.occurredAt, personName: m.note.person.displayName },
      })),
  };
}

/* ------------------------------------------------------------------ */
/*  Writes                                                             */
/* ------------------------------------------------------------------ */

/** Plain people columns from create/patch input (relations and legacy fields are handled separately). */
function columnsFrom(input: PersonPatchData): Partial<schema.NewPerson> {
  const {
    homeLocation: _home,
    metLocation: _met,
    categoryIds: _categories,
    activityIds: _activities,
    tagNames: _tags,
    hobbies: _hobbies,
    hobbiesOther: _hobbiesOther,
    introducedById: _introducer,
    nextFollowupAt,
    ...cols
  } = input;
  const out: Partial<schema.NewPerson> = { ...cols };
  if (nextFollowupAt !== undefined) out.nextFollowupAt = nextFollowupAt ? new Date(nextFollowupAt) : null;
  return out;
}

const LINKS = {
  categories: { link: personCategories, column: "category_id", target: categories },
  activities: { link: personActivities, column: "activity_id", target: activities },
  tags: { link: personTags, column: "tag_id", target: tags },
} as const;

/** Adds links to `ids` (keeping existing ones), ignoring ids that aren't the owner's. */
async function addLinks(tx: Tx, kind: keyof typeof LINKS, ownerId: string, personId: string, ids: string[]) {
  const { link, column, target } = LINKS[kind];
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  await tx.execute(
    sql`insert into ${link} (person_id, ${sql.identifier(column)}, owner_id) select ${personId}, t.id, ${ownerId} from ${target} t where t.owner_id = ${ownerId} and t.id in ${unique} on conflict do nothing`,
  );
}

/** Makes the person's links exactly `ids`, ignoring ids that aren't the owner's. */
async function replaceLinks(tx: Tx, kind: keyof typeof LINKS, ownerId: string, personId: string, ids: string[]) {
  const { link, column } = LINKS[kind];
  const unique = [...new Set(ids)];
  await tx.execute(
    sql`delete from ${link} where owner_id = ${ownerId} and person_id = ${personId}${unique.length ? sql` and not (${sql.identifier(column)} in ${unique})` : sql``}`,
  );
  await addLinks(tx, kind, ownerId, personId, unique);
}

/** Tag ids for names, creating missing tags (case-insensitive match) — lets offline clients tag by name. */
async function tagIdsForNames(tx: Tx, ownerId: string, names: string[]): Promise<string[]> {
  const clean = cleanNames(names);
  if (!clean.length) return [];
  await tx.execute(sql`insert into tags (owner_id, name) select ${ownerId}, n from unnest(${sql.param(clean)}::text[]) as n on conflict (owner_id, lower(name)) do nothing`);
  const lowered = clean.map((n) => n.toLowerCase());
  const rows = await tx.select({ id: tags.id }).from(tags).where(and(eq(tags.ownerId, ownerId), sql`lower(${tags.name}) in ${lowered}`));
  return rows.map((r) => r.id);
}

/** Maps v1 hobby slugs + free-text "other" hobbies onto activity ids, creating activities for new names. */
async function legacyActivityIds(tx: Tx, ownerId: string, hobbies: string[], other: string | null | undefined): Promise<string[]> {
  const others = cleanNames((other ?? "").split(/[,;]/)).filter((n) => slugify(n));
  if (others.length) {
    await tx
      .insert(activities)
      .values(others.map((name) => ({ ownerId, name, slug: slugify(name), sort: 100 })))
      .onConflictDoNothing({ target: [activities.ownerId, activities.slug] });
  }
  const slugs = [...new Set([...hobbies.filter((h) => h !== "other").map(slugify), ...others.map(slugify)])].filter(Boolean);
  if (!slugs.length) return [];
  const rows = await tx.select({ id: activities.id }).from(activities).where(and(eq(activities.ownerId, ownerId), inArray(activities.slug, slugs)));
  return rows.map((r) => r.id);
}

/** Returns `id` if it is one of the owner's live people (and not `self`), else null. */
async function ownedPersonId(tx: Tx, ownerId: string, id: string | null | undefined, self?: string): Promise<string | null> {
  if (!id || id === self) return null;
  const [row] = await tx.select({ id: people.id }).from(people).where(and(eq(people.ownerId, ownerId), eq(people.id, id), isNull(people.deletedAt)));
  return row?.id ?? null;
}

/**
 * How a write changes a person's activities. Only an explicit `activityIds` replaces the set; the
 * legacy v1 `hobbies`/`hobbiesOther` (import, old clients) can only add matching activities — a
 * patch that knows nothing about activities must never clear them. Pure; tested.
 */
export function activityChange(input: Pick<PersonPatchData, "activityIds" | "hobbies" | "hobbiesOther">): { replace: string[] } | { addLegacy: { hobbies: string[]; other: string | null | undefined } } | null {
  if (input.activityIds) return { replace: input.activityIds };
  if (input.hobbies && (input.hobbies.length || input.hobbiesOther?.trim())) return { addLegacy: { hobbies: input.hobbies, other: input.hobbiesOther } };
  return null;
}

async function applyRelations(tx: Tx, ownerId: string, personId: string, input: PersonPatchData) {
  if (input.categoryIds) await replaceLinks(tx, "categories", ownerId, personId, input.categoryIds);
  const activities = activityChange(input);
  if (activities && "replace" in activities) await replaceLinks(tx, "activities", ownerId, personId, activities.replace);
  else if (activities) await addLinks(tx, "activities", ownerId, personId, await legacyActivityIds(tx, ownerId, activities.addLegacy.hobbies, activities.addLegacy.other));
  if (input.tagNames) await replaceLinks(tx, "tags", ownerId, personId, await tagIdsForNames(tx, ownerId, input.tagNames));
}

/** Creates a person and returns their detail. Throws HttpError(409) if a client id is taken. */
export async function createPerson(ownerId: string, input: PersonData, source?: { kind: string; ref: string }): Promise<PersonDetail> {
  return (await createPersonIdempotent(ownerId, input, source)).person;
}

/**
 * Creates a person (and their locations and links) in one transaction. With a client-generated
 * `id`, re-sending is idempotent: an existing person with that id is returned unchanged
 * (`created: false`). An id owned by someone else, or by a deleted person, is a 409.
 */
export async function createPersonIdempotent(ownerId: string, input: PersonData, source?: { kind: string; ref: string }): Promise<{ person: PersonDetail; created: boolean }> {
  const outcome = await db.transaction(async (tx) => {
    if (input.id) {
      const [existing] = await tx.select({ ownerId: people.ownerId }).from(people).where(eq(people.id, input.id));
      if (existing) return existing.ownerId === ownerId ? ("exists" as const) : ("conflict" as const);
    }
    const homeId = input.homeLocation ? (await upsertLocation(ownerId, input.homeLocation, tx)).id : null;
    const metId = input.metLocation ? (await upsertLocation(ownerId, input.metLocation, tx)).id : null;
    const [row] = await tx
      .insert(people)
      .values({
        ...columnsFrom(input),
        ...(input.id ? { id: input.id } : {}),
        ownerId,
        displayName: input.displayName,
        homeLocationId: homeId,
        metLocationId: metId,
        introducedById: await ownedPersonId(tx, ownerId, input.introducedById),
        sourceKind: source?.kind ?? null,
        sourceRef: source?.ref ?? null,
      })
      .returning({ id: people.id });
    await applyRelations(tx, ownerId, row!.id, input);
    return row!.id;
  });
  if (outcome === "conflict") throw new HttpError(409, "A person with this id already exists");
  const id = outcome === "exists" ? input.id! : outcome;
  const person = await getPerson(ownerId, id);
  // An "existing" id may belong to a deleted person: restore it instead of creating a twin.
  if (!person) throw new HttpError(409, "A deleted person has this id; restore it instead");
  return { person, created: outcome !== "exists" };
}

/** Partial update in one transaction. Returns null if the person doesn't exist (or is deleted). */
export async function updatePerson(ownerId: string, id: string, patch: PersonPatchData) {
  const found = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.ownerId, ownerId), eq(people.id, id), isNull(people.deletedAt)))
      .for("update");
    if (!row) return false;
    const values = columnsFrom(patch);
    if (patch.homeLocation !== undefined) values.homeLocationId = patch.homeLocation ? (await upsertLocation(ownerId, patch.homeLocation, tx)).id : null;
    if (patch.metLocation !== undefined) values.metLocationId = patch.metLocation ? (await upsertLocation(ownerId, patch.metLocation, tx)).id : null;
    if (patch.introducedById !== undefined) values.introducedById = await ownedPersonId(tx, ownerId, patch.introducedById, id);
    if (Object.keys(values).length) await tx.update(people).set(values).where(and(eq(people.ownerId, ownerId), eq(people.id, id)));
    await applyRelations(tx, ownerId, id, patch);
    return true;
  });
  return found ? getPerson(ownerId, id) : null;
}

/** Soft delete. Returns false if there was nothing (left) to delete — callers treat that as done. */
export async function deletePerson(ownerId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(people)
    .set({ deletedAt: new Date() })
    .where(and(eq(people.ownerId, ownerId), eq(people.id, id), isNull(people.deletedAt)))
    .returning({ id: people.id });
  return rows.length > 0;
}

/** Undoes a soft delete. Returns the person, or null if unknown. */
export async function restorePerson(ownerId: string, id: string) {
  const rows = await db.update(people).set({ deletedAt: null }).where(and(eq(people.ownerId, ownerId), eq(people.id, id))).returning({ id: people.id });
  return rows.length ? getPerson(ownerId, id) : null;
}

/* ------------------------------------------------------------------ */
/*  Globe, places, recent contact                                      */
/* ------------------------------------------------------------------ */

/** People grouped by home location — the globe's data. Accepts the shared people filters. */
export async function globeData(ownerId: string, filters: PeopleFilters = {}) {
  const rows = await indexQuery({}, [...peopleConditions(ownerId, filters), isNotNull(people.homeLocationId)]).orderBy(desc(recencyKey), asc(people.id));
  const byLocation = new Map<string, { location: IndexLocation; people: (Omit<PersonIndexRow, "homeLocation"> & { homeLocationId: string })[] }>();
  for (const { homeLocation, ...person } of rows) {
    if (!homeLocation) continue;
    const entry = byLocation.get(homeLocation.id) ?? { location: homeLocation, people: [] };
    entry.people.push({ ...person, homeLocationId: homeLocation.id });
    byLocation.set(homeLocation.id, entry);
  }
  return [...byLocation.values()];
}

const EARTH_RADIUS_KM = 6371;

/**
 * People near a place: a country (name or ISO code) matches every home location in it; otherwise
 * the place is resolved through the cities dataset and people within `radiusKm` (haversine) are
 * returned, nearest first.
 */
export async function peopleByPlace(ownerId: string, place: string | { lat: number; lng: number }, opts: { radiusKm?: number; limit?: number } = {}) {
  const radiusKm = Math.min(Math.max(opts.radiusKm ?? 50, 1), 2000);
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);

  let center: { lat: number; lng: number; name: string; country: string | null } | null = null;
  if (typeof place === "string") {
    const text = place.trim();
    if (!text) return { place: null, people: [] };
    const [country] = await db
      .selectDistinct({ code: locations.countryCode, country: locations.country })
      .from(locations)
      .where(and(eq(locations.ownerId, ownerId), sql`(lower(${locations.country}) = lower(${text}) or upper(${locations.countryCode}) = upper(${text}))`))
      .limit(1);
    if (country?.code) {
      const rows = await indexQuery({}, peopleConditions(ownerId, { countryCode: country.code })).orderBy(desc(recencyKey), asc(people.id)).limit(limit);
      return { place: { kind: "country" as const, name: country.country, countryCode: country.code }, people: rows.map((r) => ({ ...r, distanceKm: null })) };
    }
    const [city] = await db.execute<{ name: string; country: string; lat: number; lng: number }>(sql`select name, country, lat, lng from search_cities(${text}, 1)`);
    if (!city) return { place: null, people: [] };
    center = { lat: Number(city.lat), lng: Number(city.lng), name: String(city.name), country: String(city.country) };
  } else {
    center = { ...place, name: `${place.lat.toFixed(3)}, ${place.lng.toFixed(3)}`, country: null };
  }

  const distance = sql<number>`(${EARTH_RADIUS_KM} * 2 * asin(sqrt(
    power(sin(radians(${locations.lat} - ${center.lat}) / 2), 2) +
    cos(radians(${center.lat})) * cos(radians(${locations.lat})) * power(sin(radians(${locations.lng} - ${center.lng}) / 2), 2)
  )))`.mapWith(Number);
  const rows = await indexQuery({ distanceKm: distance }, [...peopleConditions(ownerId), sql`${distance} <= ${radiusKm}`])
    .orderBy(asc(distance), desc(recencyKey))
    .limit(limit);
  return { place: { kind: "point" as const, ...center, radiusKm }, people: rows.map((r) => ({ ...r, distanceKm: Math.round(r.distanceKm * 10) / 10 })) };
}

/** People you were in touch with recently (by notes), newest first, with their latest note. */
export async function recentInteractions(ownerId: string, opts: { days?: number; limit?: number } = {}) {
  const days = Math.min(Math.max(opts.days ?? 30, 1), 3650);
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 200);
  const since = sql`now() - make_interval(days => ${days})`;
  const rows = await indexQuery(
    {
      notesInPeriod: sql<number>`(select count(*)::int from notes n where n.person_id = ${qcol(people.id)} and n.deleted_at is null and n.occurred_at >= ${since})`,
      lastNote: sql<{ id: string; title: string | null; excerpt: string; kind: string; occurredAt: string } | null>`(
        select json_build_object('id', n.id, 'title', n.title, 'excerpt', left(n.content_text, ${EXCERPT_LENGTH}), 'kind', n.kind, 'occurredAt', n.occurred_at)
        from notes n where n.person_id = ${qcol(people.id)} and n.deleted_at is null order by n.occurred_at desc limit 1)`,
    },
    [...peopleConditions(ownerId), sql`${people.lastInteractionAt} >= ${since}`],
  )
    .orderBy(desc(people.lastInteractionAt))
    .limit(limit);
  return rows;
}
