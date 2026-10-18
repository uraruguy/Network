import { afterAll, describe, expect, it, vi } from "vitest";

/** Opt-in DB checks run against the LOCAL database only (TEST_DATABASE_URL, like test/db.integration.test.ts). */
const local = vi.hoisted(() => {
  const url = process.env.TEST_DATABASE_URL;
  const ok = !!url && /@(127\.0\.0\.1|localhost)[:/]/.test(url);
  if (ok) process.env.DATABASE_URL = url;
  return ok;
});

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { categorySlug, createCategory, isUniqueViolation, updateCategory } from "./categories";
import { updateProfile } from "./profile";

describe("categorySlug", () => {
  it("slugs names like everything else", () => {
    expect(categorySlug("Close friends")).toBe("close-friends");
    expect(categorySlug("Čaj & kava")).toBe("caj-kava");
  });

  it("keeps emoji-only names apart instead of colliding on an empty slug", () => {
    expect(categorySlug("🏄")).toBe("u-1f3c4");
    expect(categorySlug("❤️")).toBe(categorySlug("❤")); // variation selector ignored
    expect(categorySlug("🏄")).not.toBe(categorySlug("⛵"));
    expect(categorySlug("   ")).toBe("");
  });
});

describe("isUniqueViolation", () => {
  const pg = { code: "23505", constraint_name: "categories_owner_slug_uidx" };
  it("sees through drizzle's wrapper", () => {
    expect(isUniqueViolation(pg)).toBe(true);
    expect(isUniqueViolation({ message: "Failed query", cause: pg }, "categories_owner_slug_uidx")).toBe(true);
    expect(isUniqueViolation({ cause: pg }, "other_constraint")).toBe(false);
    expect(isUniqueViolation({ cause: { code: "23503" } })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe.skipIf(!local)("categories and profile writes (local database)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn();
  });

  it("duplicate names are 409, empty patches change nothing", async () => {
    const [owner] = await db.execute<{ id: string }>(sql`select id from profiles limit 1`);
    if (!owner) return;
    const name = `Dup ${Date.now()}`;
    cleanup.push(() => db.execute(sql`delete from categories where owner_id = ${owner.id} and name like ${"Dup %"}`));
    const first = await createCategory(owner.id, { name, color: "#14b8a6", icon: "star", sort: 0 });
    await expect(createCategory(owner.id, { name: name.toUpperCase(), color: "#14b8a6", icon: "star", sort: 0 })).rejects.toMatchObject({ status: 409 });
    const other = await createCategory(owner.id, { name: `${name} 2`, color: "#14b8a6", icon: "star", sort: 0 });
    await expect(updateCategory(owner.id, other.id, { name })).rejects.toBeInstanceOf(HttpError);
    expect((await updateCategory(owner.id, first.id, {}))?.id).toBe(first.id);
    expect(await updateCategory(owner.id, "00000000-0000-4000-8000-000000000000", {})).toBeNull();

    const profile = await updateProfile(owner.id, {});
    expect(profile?.id).toBe(owner.id);
  });
});
