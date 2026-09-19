import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { CategoryData } from "@/lib/schemas";

const { categories } = schema;

export function listCategories(ownerId: string) {
  return db.query.categories.findMany({ where: eq(categories.ownerId, ownerId), orderBy: [asc(categories.sort), asc(categories.name)] });
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
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

export async function deleteCategory(ownerId: string, id: string) {
  await db.delete(categories).where(and(eq(categories.ownerId, ownerId), eq(categories.id, id)));
}
