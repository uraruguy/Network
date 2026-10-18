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
import { personInput, personPatch } from "@/lib/schemas";
import { activityChange, createPerson, deletePerson, updatePerson } from "./people";

describe("activityChange", () => {
  it("replaces only with explicit activityIds", () => {
    expect(activityChange({ activityIds: ["a"] })).toEqual({ replace: ["a"] });
    expect(activityChange({ activityIds: [], hobbies: ["sailing"] })).toEqual({ replace: [] });
  });

  it("legacy hobbies only add — and an empty legacy list changes nothing", () => {
    expect(activityChange({ hobbies: ["sailing"] })).toEqual({ addLegacy: { hobbies: ["sailing"], other: undefined } });
    expect(activityChange({ hobbies: ["other"], hobbiesOther: "Chess, go" })).toEqual({ addLegacy: { hobbies: ["other"], other: "Chess, go" } });
    expect(activityChange({ hobbies: [], hobbiesOther: "Chess" })).toEqual({ addLegacy: { hobbies: [], other: "Chess" } });
    // Like before: free text alone (no `hobbies`) isn't a legacy hobby write.
    expect(activityChange({ hobbiesOther: "Chess, go" })).toBeNull();
    expect(activityChange({ hobbies: [] })).toBeNull();
    expect(activityChange({ hobbies: [], hobbiesOther: "  " })).toBeNull();
    expect(activityChange({})).toBeNull();
  });
});

describe.skipIf(!local)("people writes (local database)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn();
  });

  it("an inbox/import patch with legacy hobbies keeps the person's activities", async () => {
    const [owner] = await db.execute<{ id: string }>(sql`select id from profiles limit 1`);
    if (!owner) return;
    const tag = `t${Date.now()}`;
    const [kept, added] = await db.execute<{ id: string }>(
      sql`insert into activities (owner_id, name, slug, sort) values (${owner.id}, ${`Kept ${tag}`}, ${`kept-${tag}`}, 100), (${owner.id}, ${`Added ${tag}`}, ${`added-${tag}`}, 100) returning id`,
    );
    cleanup.push(() => db.execute(sql`delete from activities where owner_id = ${owner.id} and slug like ${`%-${tag}`}`));
    const person = await createPerson(owner.id, personInput.parse({ displayName: `Activities ${tag}`, activityIds: [kept!.id] }));
    cleanup.push(() => db.execute(sql`delete from people where owner_id = ${owner.id} and id = ${person.id}`));

    const patched = await updatePerson(owner.id, person.id, personPatch.parse({ hobbies: [`added-${tag}`] }));
    expect(new Set(patched?.activityIds)).toEqual(new Set([kept!.id, added!.id]));
    // Nothing about activities in the patch → nothing changes.
    expect((await updatePerson(owner.id, person.id, personPatch.parse({ hobbies: [], headline: "x" })))?.activityIds.length).toBe(2);
    // Explicit ids still replace.
    expect((await updatePerson(owner.id, person.id, personPatch.parse({ activityIds: [added!.id] })))?.activityIds).toEqual([added!.id]);

    // Deleting twice is fine (the route answers ok either way).
    expect(await deletePerson(owner.id, person.id)).toBe(true);
    expect(await deletePerson(owner.id, person.id)).toBe(false);
  });
});
