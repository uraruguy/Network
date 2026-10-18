import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const { profiles, locations } = schema;

/** The owner's profile with its home location — one query. */
export async function getProfile(ownerId: string) {
  const [row] = await db
    .select({ profile: profiles, homeLocation: locations })
    .from(profiles)
    .leftJoin(locations, eq(locations.id, profiles.homeLocationId))
    .where(eq(profiles.id, ownerId));
  if (!row) return null;
  return { ...row.profile, homeLocation: row.homeLocation };
}

/** Partial update → the profile row. Undefined fields are skipped; an empty patch changes nothing. */
export async function updateProfile(
  ownerId: string,
  patch: Partial<Pick<schema.Profile, "displayName" | "timezone" | "homeLocationId" | "digestHour" | "digestEnabled" | "inboxToken" | "lastDigestOn">>,
) {
  const values = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as typeof patch;
  if (!Object.keys(values).length) {
    const [row] = await db.select().from(profiles).where(eq(profiles.id, ownerId));
    return row ?? null;
  }
  const [row] = await db.update(profiles).set(values).where(eq(profiles.id, ownerId)).returning();
  return row ?? null;
}

export type Stats = { people: number; cities: number; dueToday: number; overdue: number; upcoming7d: number };

/**
 * Headline numbers for the Today screen, with "today" in the owner's timezone — one query.
 * Reminder counts cover open reminders of live people: overdue (before today), due today, and
 * the 7 days after today.
 */
export async function getStats(ownerId: string): Promise<Stats> {
  const [row] = await db.execute<Stats>(sql`
    with tz as (
      select coalesce((select timezone from profiles where id = ${ownerId}), 'UTC') as name
    ), bounds as (
      select
        (date_trunc('day', now() at time zone tz.name)) at time zone tz.name as today,
        (date_trunc('day', now() at time zone tz.name) + interval '1 day') at time zone tz.name as tomorrow,
        (date_trunc('day', now() at time zone tz.name) + interval '8 days') at time zone tz.name as week_end
      from tz
    ), open as (
      select r.due_at from reminders r join people p on p.id = r.person_id and p.deleted_at is null
      where r.owner_id = ${ownerId} and r.status in ('pending', 'sent', 'snoozed')
    )
    select
      (select count(*)::int from people where owner_id = ${ownerId} and deleted_at is null) as "people",
      (select count(distinct home_location_id)::int from people where owner_id = ${ownerId} and deleted_at is null and home_location_id is not null) as "cities",
      (select count(*)::int from open, bounds where due_at >= bounds.today and due_at < bounds.tomorrow) as "dueToday",
      (select count(*)::int from open, bounds where due_at < bounds.today) as "overdue",
      (select count(*)::int from open, bounds where due_at >= bounds.tomorrow and due_at < bounds.week_end) as "upcoming7d"
  `);
  return row ?? { people: 0, cities: 0, dueToday: 0, overdue: 0, upcoming7d: 0 };
}
