import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { qcol } from "./sql";
import { slugify } from "@/lib/text";

/** Activities: things you do with people (football, dinners …). Seeded per owner, fully editable. */

const { activities, personActivities, people } = schema;

export const activityCount = sql<number>`(select count(*)::int from ${personActivities} pa join ${people} p on p.id = pa.person_id and p.deleted_at is null where pa.activity_id = ${qcol(activities.id)})`;

const columns = { id: activities.id, name: activities.name, slug: activities.slug, emoji: activities.emoji, sort: activities.sort };
export type ActivityRow = { id: string; name: string; slug: string; emoji: string | null; sort: number; count: number };

export function listActivities(ownerId: string): Promise<ActivityRow[]> {
  return db
    .select({ ...columns, count: activityCount })
    .from(activities)
    .where(eq(activities.ownerId, ownerId))
    .orderBy(asc(activities.sort), asc(activities.name));
}

async function getActivity(ownerId: string, id: string): Promise<ActivityRow | null> {
  const [row] = await db
    .select({ ...columns, count: activityCount })
    .from(activities)
    .where(and(eq(activities.ownerId, ownerId), eq(activities.id, id)));
  return row ?? null;
}

export type ActivityWriteResult = { status: "ok"; activity: ActivityRow; created?: boolean } | { status: "conflict"; message: string } | { status: "not_found" } | { status: "invalid"; message: string };

/**
 * Creates an activity, idempotently: the same name (same slug) returns the existing one, and a
 * repeated client-generated `id` returns that activity.
 */
export async function createActivity(ownerId: string, input: { id?: string; name: string; emoji?: string | null; sort?: number }): Promise<ActivityWriteResult> {
  const slug = slugify(input.name);
  if (!slug) return { status: "invalid", message: "Name needs at least one letter or digit" };
  if (input.id) {
    const [byId] = await db.select({ ownerId: activities.ownerId }).from(activities).where(eq(activities.id, input.id));
    if (byId) return byId.ownerId === ownerId ? { status: "ok", activity: (await getActivity(ownerId, input.id))!, created: false } : { status: "conflict", message: "Id already in use" };
  }
  const sort = input.sort ?? sql`coalesce((select max(sort) + 1 from activities where owner_id = ${ownerId}), 0)`;
  const [row] = await db
    .insert(activities)
    .values({ ...(input.id ? { id: input.id } : {}), ownerId, name: input.name.trim(), slug, emoji: input.emoji ?? null, sort })
    .onConflictDoNothing({ target: [activities.ownerId, activities.slug] })
    .returning({ id: activities.id });
  if (row) return { status: "ok", activity: (await getActivity(ownerId, row.id))!, created: true };
  const [existing] = await db.select({ id: activities.id }).from(activities).where(and(eq(activities.ownerId, ownerId), eq(activities.slug, slug)));
  return { status: "ok", activity: (await getActivity(ownerId, existing!.id))!, created: false };
}

export async function updateActivity(ownerId: string, id: string, patch: { name?: string; emoji?: string | null; sort?: number }): Promise<ActivityWriteResult> {
  const values: Partial<schema.Activity> = {};
  if (patch.name !== undefined) {
    const slug = slugify(patch.name);
    if (!slug) return { status: "invalid", message: "Name needs at least one letter or digit" };
    const [clash] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(and(eq(activities.ownerId, ownerId), eq(activities.slug, slug), sql`${activities.id} <> ${id}`));
    if (clash) return { status: "conflict", message: "Another activity already has this name" };
    values.name = patch.name.trim();
    values.slug = slug;
  }
  if (patch.emoji !== undefined) values.emoji = patch.emoji;
  if (patch.sort !== undefined) values.sort = patch.sort;
  if (Object.keys(values).length) {
    const rows = await db.update(activities).set(values).where(and(eq(activities.ownerId, ownerId), eq(activities.id, id))).returning({ id: activities.id });
    if (!rows.length) return { status: "not_found" };
  }
  const activity = await getActivity(ownerId, id);
  return activity ? { status: "ok", activity } : { status: "not_found" };
}

export async function deleteActivity(ownerId: string, id: string): Promise<boolean> {
  const rows = await db.delete(activities).where(and(eq(activities.ownerId, ownerId), eq(activities.id, id))).returning({ id: activities.id });
  return rows.length > 0;
}

/** Sets `sort` to the position in `ids` (ids not listed keep their order after them). */
export async function reorderActivities(ownerId: string, ids: string[]) {
  await db.execute(sql`
    update activities a set sort = x.ord::int
    from unnest(${sql.param(ids)}::uuid[]) with ordinality as x(id, ord)
    where a.id = x.id and a.owner_id = ${ownerId}`);
  await db.execute(sql`
    update activities a set sort = ${ids.length} + 1 + r.rn::int
    from (select id, row_number() over (order by sort, name) as rn from activities where owner_id = ${ownerId} and not (id = any(${sql.param(ids)}::uuid[]))) r
    where a.id = r.id`);
  return listActivities(ownerId);
}
