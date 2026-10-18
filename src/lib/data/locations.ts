import "server-only";
import { sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/lib/db";
import type { LocationData } from "@/lib/schemas";

/**
 * Find-or-create an owner-scoped location in one statement. Places from the cities dataset dedupe
 * on (owner, cityId); manual places (no cityId) are always inserted.
 */
export async function upsertLocation(ownerId: string, input: LocationData, tx: Tx | typeof db = db) {
  const [row] = await tx
    .insert(schema.locations)
    .values({
      ownerId,
      name: input.name,
      admin: input.admin ?? null,
      country: input.country,
      countryCode: input.countryCode ?? null,
      lat: input.lat,
      lng: input.lng,
      timezone: input.timezone ?? null,
      cityId: input.cityId ?? null,
      source: input.cityId ? "cities" : "manual",
    })
    .onConflictDoUpdate({
      target: [schema.locations.ownerId, schema.locations.cityId],
      // Keep the stored row; touching updated_at makes RETURNING yield the existing id.
      set: { updatedAt: sql`now()` },
    })
    .returning();
  return row!;
}

export async function searchCities(q: string, limit = 8) {
  if (!q.trim()) return [];
  // search_cities() is defined in the init migration (prefix match, population-ranked)
  const rows = await db.execute(sql`select * from search_cities(${q.trim()}, ${limit})`);
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    asciiName: String(r.ascii_name),
    admin: (r.admin as string | null) ?? null,
    country: String(r.country),
    countryCode: String(r.country_code),
    lat: Number(r.lat),
    lng: Number(r.lng),
    population: r.population == null ? null : Number(r.population),
    timezone: (r.timezone as string | null) ?? null,
  })) satisfies schema.City[];
}
