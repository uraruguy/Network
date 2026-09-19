import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { PersonData, PersonPatchData } from "@/lib/schemas";
import { upsertLocation } from "./locations";

const { people, personCategories, locations, categories, notes, reminders } = schema;

export type PersonListItem = Awaited<ReturnType<typeof listPeople>>[number];
export type PersonDetail = NonNullable<Awaited<ReturnType<typeof getPerson>>>;

const withRelations = {
  homeLocation: true,
  metLocation: true,
  introducedBy: { columns: { id: true, displayName: true, avatarUrl: true } },
  categories: { with: { category: true } },
} as const;

function flattenCategories<T extends { categories: { category: schema.Category }[] }>(p: T) {
  const { categories: pcs, ...rest } = p;
  return { ...rest, categories: pcs.map((pc) => pc.category).sort((a, b) => a.sort - b.sort) };
}

export async function listPeople(ownerId: string, opts: { q?: string; categoryId?: string; warmth?: schema.Warmth; countryCode?: string } = {}) {
  const rows = await db.query.people.findMany({
    where: and(
      eq(people.ownerId, ownerId),
      isNull(people.deletedAt),
      opts.q ? or(ilike(people.displayName, `%${opts.q}%`), ilike(people.company, `%${opts.q}%`), ilike(people.headline, `%${opts.q}%`)) : undefined,
      opts.warmth ? eq(people.warmth, opts.warmth) : undefined,
      opts.categoryId
        ? inArray(people.id, db.select({ id: personCategories.personId }).from(personCategories).where(eq(personCategories.categoryId, opts.categoryId)))
        : undefined,
      opts.countryCode
        ? inArray(people.homeLocationId, db.select({ id: locations.id }).from(locations).where(eq(locations.countryCode, opts.countryCode)))
        : undefined,
    ),
    with: withRelations,
    orderBy: [desc(sql`coalesce(${people.lastInteractionAt}, ${people.createdAt})`), asc(people.displayName)],
  });
  return rows.map(flattenCategories);
}

export async function getPerson(ownerId: string, id: string) {
  const row = await db.query.people.findFirst({
    where: and(eq(people.ownerId, ownerId), eq(people.id, id), isNull(people.deletedAt)),
    with: {
      ...withRelations,
      introduced: { columns: { id: true, displayName: true, avatarUrl: true, headline: true } },
      notes: {
        where: isNull(notes.deletedAt),
        orderBy: [desc(notes.pinned), desc(notes.occurredAt)],
        columns: { id: true, title: true, contentText: true, kind: true, occurredAt: true, pinned: true, updatedAt: true },
      },
      reminders: { where: inArray(reminders.status, ["pending", "sent", "snoozed"]), orderBy: [asc(reminders.dueAt)] },
      mentions: { with: { note: { columns: { id: true, personId: true, title: true, contentText: true, occurredAt: true } } } },
    },
  });
  if (!row) return null;
  return flattenCategories(row);
}

async function setCategories(ownerId: string, personId: string, categoryIds: string[]) {
  await db.delete(personCategories).where(eq(personCategories.personId, personId));
  if (categoryIds.length) {
    const valid = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.ownerId, ownerId), inArray(categories.id, categoryIds)));
    if (valid.length) await db.insert(personCategories).values(valid.map((c) => ({ ownerId, personId, categoryId: c.id })));
  }
}

function columnsFrom(input: PersonPatchData) {
  const { homeLocation: _h, metLocation: _m, categoryIds: _c, nextFollowupAt, ...cols } = input;
  const out: Partial<schema.NewPerson> = { ...cols };
  if (nextFollowupAt !== undefined) out.nextFollowupAt = nextFollowupAt ? new Date(nextFollowupAt) : null;
  return out;
}

export async function createPerson(ownerId: string, input: PersonData, source?: { kind: string; ref: string }) {
  const home = input.homeLocation ? await upsertLocation(ownerId, input.homeLocation) : null;
  const met = input.metLocation ? await upsertLocation(ownerId, input.metLocation) : null;
  const [row] = await db
    .insert(people)
    .values({
      ...columnsFrom(input),
      ownerId,
      displayName: input.displayName,
      homeLocationId: home?.id ?? null,
      metLocationId: met?.id ?? null,
      sourceKind: source?.kind ?? null,
      sourceRef: source?.ref ?? null,
    })
    .returning();
  await setCategories(ownerId, row!.id, input.categoryIds);
  return (await getPerson(ownerId, row!.id))!;
}

export async function updatePerson(ownerId: string, id: string, patch: PersonPatchData) {
  const values: Partial<schema.NewPerson> = columnsFrom(patch);
  if (patch.homeLocation !== undefined) values.homeLocationId = patch.homeLocation ? (await upsertLocation(ownerId, patch.homeLocation)).id : null;
  if (patch.metLocation !== undefined) values.metLocationId = patch.metLocation ? (await upsertLocation(ownerId, patch.metLocation)).id : null;
  if (Object.keys(values).length) {
    await db.update(people).set(values).where(and(eq(people.ownerId, ownerId), eq(people.id, id)));
  }
  if (patch.categoryIds) await setCategories(ownerId, id, patch.categoryIds);
  return getPerson(ownerId, id);
}

export async function deletePerson(ownerId: string, id: string) {
  await db.update(people).set({ deletedAt: new Date() }).where(and(eq(people.ownerId, ownerId), eq(people.id, id)));
}

/** People grouped by home location — the globe's data. */
export async function globeData(ownerId: string) {
  const rows = await db.query.people.findMany({
    where: and(eq(people.ownerId, ownerId), isNull(people.deletedAt)),
    columns: { id: true, displayName: true, avatarUrl: true, headline: true, company: true, warmth: true, homeLocationId: true, lastInteractionAt: true },
    with: { homeLocation: true, categories: { columns: { categoryId: true } } },
  });
  const byLocation = new Map<string, { location: schema.Location; people: Array<Omit<(typeof rows)[number], "homeLocation" | "categories"> & { categoryIds: string[] }> }>();
  for (const r of rows) {
    if (!r.homeLocation) continue;
    const { homeLocation, categories: cats, ...person } = r;
    const entry = byLocation.get(homeLocation.id) ?? { location: homeLocation, people: [] };
    entry.people.push({ ...person, categoryIds: cats.map((c) => c.categoryId) });
    byLocation.set(homeLocation.id, entry);
  }
  return [...byLocation.values()];
}
