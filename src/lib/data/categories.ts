import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { qcol } from "./sql";
import type { CategoryData } from "@/lib/schemas";
import { slugify } from "@/lib/text";

const { categories, personCategories, people } = schema;

/**
 * The unique per-owner key of a category name. Names without letters or digits ("🏄", "❤️") get
 * a slug from their code points, so two different emoji are two categories and the same emoji
 * twice is a duplicate — instead of every such name colliding on "". Pure; tested.
 */
export function categorySlug(name: string): string {
  const slug = slugify(name);
  if (slug) return slug;
  const points = [...name.trim()].map((c) => c.codePointAt(0)!).filter((cp) => cp !== 0xfe0f && cp !== 0x200d);
  return points.length ? `u-${points.map((cp) => cp.toString(16)).join("-")}` : "";
}

const DUPLICATE = "A category with this name already exists.";

/** Postgres unique violation (23505), possibly wrapped by drizzle (`DrizzleQueryError.cause`). */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  for (let e = err as { code?: unknown; constraint_name?: unknown; cause?: unknown } | undefined, depth = 0; e && depth < 4; e = e.cause as typeof e, depth++) {
    if (e.code === "23505") return !constraint || e.constraint_name === constraint;
  }
  return false;
}

/** Turns a duplicate slug into 409 conflict. */
async function uniqueName<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (isUniqueViolation(err, "categories_owner_slug_uidx")) throw new HttpError(409, DUPLICATE);
    throw err;
  }
}

function slugFor(name: string): string {
  const slug = categorySlug(name);
  if (!slug) throw new HttpError(422, "Give the category a name.");
  return slug;
}

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

/** Creates a category. Throws HttpError 409 when the name (by slug) is taken, 422 when it's blank. */
export async function createCategory(ownerId: string, input: CategoryData) {
  const slug = slugFor(input.name);
  const [row] = await uniqueName(() => db.insert(categories).values({ ...input, ownerId, slug }).returning());
  return row!;
}

/** Partial update; null if the category isn't the owner's. An empty patch changes nothing. Throws 409 on a taken name. */
export async function updateCategory(ownerId: string, id: string, patch: Partial<CategoryData>) {
  const values = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<CategoryData> & { slug?: string };
  if (values.name !== undefined) values.slug = slugFor(values.name);
  const scope = and(eq(categories.ownerId, ownerId), eq(categories.id, id));
  if (!Object.keys(values).length) return (await db.query.categories.findFirst({ where: scope })) ?? null;
  const [row] = await uniqueName(() => db.update(categories).set(values).where(scope).returning());
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
