import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { qcol } from "./sql";
import type { CategoryData } from "@/lib/schemas";
import { slugify } from "@/lib/text";

const { categories, personCategories, people } = schema;

/** Live people linked to the row (for taxonomy counts). */
export const categoryCount = sql<number>`(select count(*)::int from ${personCategories} pc join ${people} p on p.id = pc.person_id and p.deleted_at is null where pc.category_id = ${qcol(categories.id)})`;

export function listCategories(ownerId: string) {
  return db.query.categories.findMany({ where: eq(categories.ownerId, ownerId), orderBy: [asc(categories.sort), asc(categories.name)] });
}

export function listCategoriesWithCounts(ownerId: string) {
  return db
    .select({ id: categories.id, name: categories.name, slug: categories.slug, color: categories.color, icon: categories.icon, sort: categories.sort, count: categoryCount })
    .from(categories)
    .where(eq(categories.ownerId, ownerId))
    .orderBy(asc(categories.sort), asc(categories.name));
}

export async function createCategory(ownerId: string, input: CategoryData) {
  const [row] = await db.insert(categories).values({ ownerId, ...input, slug: slugify(input.name) }).returning();
  return row!;
}

export async function updateCategory(ownerId: string, id: string, patch: Partial<CategoryData>) {
  const [row] = await db
    .update(categories)
    .set({ ...patch, ...(patch.name ? { slug: slugify(patch.name) } : {}) })
    .where(and(eq(categories.ownerId, ownerId), eq(categories.id, id)))
    .returning();
  return row ?? null;
}

/** Sets `sort` to the position in `ids` (categories not listed keep their order after them). */
export async function reorderCategories(ownerId: string, ids: string[]) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      update categories c set sort = x.ord::int
      from unnest(${sql.param(ids)}::uuid[]) with ordinality as x(id, ord)
      where c.id = x.id and c.owner_id = ${ownerId}`);
    await tx.execute(sql`
      update categories c set sort = ${ids.length} + r.rn::int
      from (select id, row_number() over (order by sort, name) as rn from categories where owner_id = ${ownerId} and not (id = any(${sql.param(ids)}::uuid[]))) r
      where c.id = r.id`);
  });
  return listCategoriesWithCounts(ownerId);
}

export async function deleteCategory(ownerId: string, id: string): Promise<boolean> {
  const rows = await db.delete(categories).where(and(eq(categories.ownerId, ownerId), eq(categories.id, id))).returning({ id: categories.id });
  return rows.length > 0;
}
