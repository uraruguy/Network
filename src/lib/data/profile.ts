import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export async function getProfile(ownerId: string) {
  const row = await db.query.profiles.findFirst({ where: eq(schema.profiles.id, ownerId) });
  if (!row) return null;
  const home = row.homeLocationId ? await db.query.locations.findFirst({ where: eq(schema.locations.id, row.homeLocationId) }) : null;
  return { ...row, homeLocation: home ?? null };
}

export async function updateProfile(ownerId: string, patch: Partial<Pick<schema.Profile, "displayName" | "timezone" | "homeLocationId" | "digestHour" | "digestEnabled" | "inboxToken">>) {
  const [row] = await db.update(schema.profiles).set(patch).where(eq(schema.profiles.id, ownerId)).returning();
  return row ?? null;
}
