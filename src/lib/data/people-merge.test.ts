import { afterAll, describe, expect, it, vi } from "vitest";

/** Opt-in DB checks run against the LOCAL database only (TEST_DATABASE_URL, like people.test.ts). */
const local = vi.hoisted(() => {
  const url = process.env.TEST_DATABASE_URL;
  const ok = !!url && /@(127\.0\.0\.1|localhost)[:/]/.test(url);
  if (ok) process.env.DATABASE_URL = url;
  return ok;
});

import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { mergePatch, mergePeople } from "./people-merge";

type Person = typeof schema.people.$inferSelect;
const person = (over: Partial<Person>): Person =>
  ({ id: "k", displayName: "X", hobbies: [], languages: [], interests: [], lastInteractionAt: null, introducedById: null, ...over }) as Person;

describe("mergePatch", () => {
  it("fills blanks only and unions lists", () => {
    const keep = person({ id: "k", headline: "Developer", company: null, email: "", languages: ["sl"] });
    const drop = person({ id: "d", headline: "Founder", company: "PackOpti", email: "vid@x.si", languages: ["sl", "en"] });
    expect(mergePatch(keep, drop)).toEqual({ company: "PackOpti", email: "vid@x.si", languages: ["sl", "en"] });
  });

  it("keeps the later interaction and never self-introduces", () => {
    const keep = person({ id: "k", lastInteractionAt: new Date("2026-01-01") });
    const drop = person({ id: "d", lastInteractionAt: new Date("2026-05-01"), introducedById: "k" });
    expect(mergePatch(keep, drop)).toEqual({ lastInteractionAt: new Date("2026-05-01") });
  });
});

describe.skipIf(!local)("mergePeople (local database)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn();
  });

  it("moves notes, mentions, links and facts, then soft-deletes the duplicate", async () => {
    const [owner] = await db.execute<{ id: string }>(sql`select id from profiles limit 1`);
    if (!owner) return;
    const tag = `m${Date.now()}`;
    const [keep, drop, other] = await db.execute<{ id: string }>(sql`
      insert into people (owner_id, display_name, headline) values
        (${owner.id}, ${`Keep ${tag}`}, 'Developer'), (${owner.id}, ${`Drop ${tag}`}, null), (${owner.id}, ${`Other ${tag}`}, null)
      returning id`);
    cleanup.push(() => db.execute(sql`delete from people where owner_id = ${owner.id} and display_name like ${`% ${tag}`}`));
    await db.execute(sql`update people set company = 'PackOpti' where id = ${drop!.id}`);
    const [cat] = await db.execute<{ id: string }>(sql`select id from categories where owner_id = ${owner.id} limit 1`);
    if (cat) await db.execute(sql`insert into person_categories (owner_id, person_id, category_id) values (${owner.id}, ${drop!.id}, ${cat.id})`);
    await db.execute(sql`
      insert into notes (owner_id, person_id, title, content_md, content_text, kind, pinned, source_kind, source_ref) values
        (${owner.id}, ${keep!.id}, 'facts', '- Developer', '• Developer', 'note', true, 'apple-notes', ${`apple-notes:facts:keep-${tag}`}),
        (${owner.id}, ${drop!.id}, 'facts', '- Set up the Eurobox meeting', '• Set up the Eurobox meeting', 'note', true, 'apple-notes', ${`apple-notes:facts:drop-${tag}`}),
        (${owner.id}, ${drop!.id}, 'lunch', 'Lunch', 'Lunch', 'note', false, null, null)`);
    const [otherNote] = await db.execute<{ id: string }>(sql`
      insert into notes (owner_id, person_id, title, content_md, content_text, kind) values (${owner.id}, ${other!.id}, 'x', 'x', 'x', 'note') returning id`);
    await db.execute(sql`insert into note_mentions (owner_id, note_id, person_id) values (${owner.id}, ${otherNote!.id}, ${drop!.id})`);

    const dry = await mergePeople(db, owner.id, keep!.id, drop!.id, { write: false });
    expect(dry.dryRun).toBe(true);
    expect((await db.execute(sql`select 1 from people where id = ${drop!.id} and deleted_at is null`)).length).toBe(1);

    const r = await mergePeople(db, owner.id, keep!.id, drop!.id, { write: true });
    expect(r.fields).toEqual(["company"]);
    expect(r.factsMerged).toBe(true);
    expect(r.moved).toMatchObject({ notes: 1, mentions: 1, person_categories: cat ? 1 : 0 });
    const notes = await db.execute<{ title: string; content_md: string }>(sql`select title, content_md from notes where person_id = ${keep!.id} and deleted_at is null order by title`);
    expect(notes.map((n) => n.title)).toEqual(["facts", "lunch"]);
    expect(notes[0]!.content_md).toContain("Eurobox");
    expect((await db.execute(sql`select 1 from note_mentions where note_id = ${otherNote!.id} and person_id = ${keep!.id}`)).length).toBe(1);
    expect((await db.execute(sql`select 1 from people where id = ${drop!.id} and deleted_at is not null`)).length).toBe(1);
    await expect(mergePeople(db, owner.id, keep!.id, drop!.id, { write: true })).rejects.toThrow(/must exist/);
  });
});
