import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { qcol } from "./sql";
import { listActivities } from "./activities";
import { listCategoriesWithCounts } from "./categories";

/**
 * Tags: free-form labels, unique per owner case-insensitively. Created implicitly from a person's
 * `tagNames`; managed (rename, colour, merge, delete) here.
 */

const { tags, personTags, people } = schema;

export const tagCount = sql<number>`(select count(*)::int from ${personTags} pt join ${people} p on p.id = pt.person_id and p.deleted_at is null where pt.tag_id = ${qcol(tags.id)})`;

const columns = { id: tags.id, name: tags.name, color: tags.color };
export type TagRow = { id: string; name: string; color: string | null; count: number };

export function listTags(ownerId: string): Promise<TagRow[]> {
  return db
    .select({ ...columns, count: tagCount })
    .from(tags)
    .where(eq(tags.ownerId, ownerId))
    .orderBy(asc(sql`lower(${tags.name})`));
}

async function getTag(ownerId: string, id: string): Promise<TagRow | null> {
  const [row] = await db
    .select({ ...columns, count: tagCount })
    .from(tags)
    .where(and(eq(tags.ownerId, ownerId), eq(tags.id, id)));
  return row ?? null;
}

export type TagWriteResult = { status: "ok"; tag: TagRow } | { status: "conflict"; message: string; existingId?: string } | { status: "not_found" };

/** Rename / recolour. Renaming onto another tag's name is a conflict — merge instead. */
export async function updateTag(ownerId: string, id: string, patch: { name?: string; color?: string | null }): Promise<TagWriteResult> {
  const values: Partial<schema.Tag> = {};
  if (patch.name !== undefined) {
    const name = patch.name.replace(/\s+/g, " ").trim();
    const [clash] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.ownerId, ownerId), sql`lower(${tags.name}) = lower(${name})`, sql`${tags.id} <> ${id}`));
    if (clash) return { status: "conflict", message: "Another tag already has this name; merge them instead", existingId: clash.id };
    values.name = name;
  }
  if (patch.color !== undefined) values.color = patch.color ?? null;
  if (Object.keys(values).length) {
    const rows = await db.update(tags).set(values).where(and(eq(tags.ownerId, ownerId), eq(tags.id, id))).returning({ id: tags.id });
    if (!rows.length) return { status: "not_found" };
  }
  const tag = await getTag(ownerId, id);
  return tag ? { status: "ok", tag } : { status: "not_found" };
}

export async function deleteTag(ownerId: string, id: string): Promise<boolean> {
  const rows = await db.delete(tags).where(and(eq(tags.ownerId, ownerId), eq(tags.id, id))).returning({ id: tags.id });
  return rows.length > 0;
}

/** Moves every person from tag `id` onto `intoId`, then deletes `id`. */
export async function mergeTags(ownerId: string, id: string, intoId: string): Promise<TagWriteResult> {
  if (id === intoId) return { status: "conflict", message: "Cannot merge a tag into itself" };
  const ok = await db.transaction(async (tx) => {
    const found = await tx.select({ id: tags.id }).from(tags).where(and(eq(tags.ownerId, ownerId), sql`${tags.id} in ${[id, intoId]}`));
    if (found.length !== 2) return false;
    await tx.execute(sql`
      insert into person_tags (person_id, tag_id, owner_id)
      select person_id, ${intoId}, ${ownerId} from person_tags where tag_id = ${id} and owner_id = ${ownerId}
      on conflict do nothing`);
    await tx.delete(tags).where(and(eq(tags.ownerId, ownerId), eq(tags.id, id)));
    return true;
  });
  if (!ok) return { status: "not_found" };
  return { status: "ok", tag: (await getTag(ownerId, intoId))! };
}

/** Categories, tags and activities with live-people counts (filters, AI context). */
export async function listTaxonomy(ownerId: string) {
  const [categories, tagRows, activities] = await Promise.all([listCategoriesWithCounts(ownerId), listTags(ownerId), listActivities(ownerId)]);
  return { categories, tags: tagRows, activities };
}
