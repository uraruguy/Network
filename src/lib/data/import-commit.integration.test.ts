/**
 * Import commit, rollback and inbox apply against a LOCAL Supabase database. Opt-in:
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm test
 * Every case runs inside a transaction that is rolled back, under its own source name.
 */
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { importCommitLog, importItemsX, importMentions, importPeople, remindersX } from "@/lib/db/schema-import";
import { commitImport, rollbackImport } from "./import-commit";
import { mergeProposals } from "./import-review";
import type { Tx } from "./import-shared";
import { applyInbox } from "./inbox";

const url = process.env.TEST_DATABASE_URL;
const local = !!url && /@(127\.0\.0\.1|localhost)[:/]/.test(url);
const { people, notes, profiles, importJobs, tags, personTags, inboxItems } = schema;

class Rollback extends Error {}

async function fixture(tx: Tx) {
  const [owner] = await tx.select({ id: profiles.id }).from(profiles).limit(1);
  if (!owner) throw new Error("no local profile (run pnpm bootstrap)");
  const ownerId = owner.id;
  const run = randomUUID().slice(0, 8);
  const source = `itest-${run}`;
  const [job] = await tx.insert(importJobs).values({ ownerId, source, label: "itest" }).returning({ id: importJobs.id });
  let n = 0;
  const item = async (text: string) => {
    const [row] = await tx
      .insert(importItemsX)
      .values({ ownerId, jobId: job!.id, source, externalId: `${source}:${++n}`, title: `Item ${n}`, text, status: "extracted", extractionVersion: 2, candidates: { version: 2, candidates: [] } })
      .returning();
    return row!;
  };
  const proposal = async (key: string, o: Partial<typeof importPeople.$inferInsert> = {}) => {
    const [row] = await tx
      .insert(importPeople)
      .values({ ownerId, source, key: `${key}-${run}`, displayName: key, status: "approved", disposition: "person", decidedBy: "user", needsReview: false, ...o })
      .returning();
    return row!;
  };
  let idx = 0;
  const mention = (itemId: string, importPersonId: string, role: "primary" | "mention") => tx.insert(importMentions).values({ ownerId, itemId, candidateIndex: idx++, surface: "x", importPersonId, role });
  const person = async (displayName: string) => (await tx.insert(people).values({ ownerId, displayName }).returning({ id: people.id }))[0]!.id;
  const commit = (o: { keys?: string[] } = {}) => commitImport(tx, ownerId, { source, dryRun: false, keys: o.keys?.map((k) => `${k}-${run}`) });
  const noteOf = async (itemId: string) => {
    const [it] = await tx.select({ externalId: importItemsX.externalId }).from(importItemsX).where(eq(importItemsX.id, itemId));
    return tx.select().from(notes).where(and(eq(notes.ownerId, ownerId), eq(notes.sourceKind, source), eq(notes.sourceRef, it!.externalId)));
  };
  return { ownerId, source, run, item, proposal, mention, person, commit, noteOf };
}

describe.skipIf(!local)("import commit (local database)", () => {
  const client = local ? postgres(url!, { max: 1 }) : null;
  const tdb = client ? drizzle(client, { schema }) : null;
  afterAll(async () => {
    await client?.end();
  });
  const inTx = (fn: (tx: Tx, f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) => () =>
    tdb!
      .transaction(async (raw) => {
        const tx = raw as unknown as Tx;
        await fn(tx, await fixture(tx));
        throw new Rollback();
      })
      .catch((e) => {
        if (!(e instanceof Rollback)) throw e;
      });

  it(
    "keeps deleted and edited notes, refreshes untouched ones, one facts note and reminder per person",
    inTx(async (tx, f) => {
      const ana = await f.person("Ana Itest");
      const [i1, i2, i3] = [await f.item("first"), await f.item("second"), await f.item("third")];
      const p1 = await f.proposal("ana-1", { matchPersonId: ana, profile: { keyFacts: ["likes padel"], followUps: [{ what: "Call Ana", when: null, sourceItemId: i1.id }] } });
      const p2 = await f.proposal("ana-2", { matchPersonId: ana, profile: { keyFacts: ["works at Acme"], followUps: [{ what: "Send the deck", when: null, sourceItemId: i1.id }] } });
      await f.mention(i1.id, p1.id, "primary");
      await f.mention(i2.id, p1.id, "primary");
      await f.mention(i3.id, p2.id, "primary");

      const r1 = await f.commit();
      expect(r1.people.failed).toEqual([]);
      expect(r1.notes.created).toBe(3);
      const facts = await tx.select().from(notes).where(and(eq(notes.personId, ana), eq(notes.sourceKind, f.source), eq(notes.pinned, true)));
      expect(facts).toHaveLength(1);
      expect(facts[0]!.contentMd).toContain("likes padel");
      expect(facts[0]!.contentMd).toContain("works at Acme");
      expect(facts[0]!.contentMd).toContain("Send the deck"); // the second reminder became an open thread
      expect(await tx.select().from(remindersX).where(and(eq(remindersX.personId, ana), eq(remindersX.sourceKind, f.source)))).toHaveLength(1);
      expect(r1.reminders).toBe(1);

      // The user deletes note 1 and edits note 2 in the editor; all three change in Apple Notes.
      const [n1] = await f.noteOf(i1.id);
      const [n2] = await f.noteOf(i2.id);
      await tx.update(notes).set({ deletedAt: new Date() }).where(eq(notes.id, n1!.id));
      await tx.update(notes).set({ contentJson: { type: "doc" }, contentText: "my version" }).where(eq(notes.id, n2!.id));
      await tx.execute(sql`update import_items set text = text || ' (changed)' where id in (${i1.id}::uuid, ${i2.id}::uuid, ${i3.id}::uuid)`);

      const r2 = await f.commit();
      expect(r2.notes).toMatchObject({ created: 0, updated: 1, deleted: 1, edited: 1 });
      expect((await f.noteOf(i1.id)).map((n) => !!n.deletedAt)).toEqual([true]);
      expect((await f.noteOf(i2.id))[0]!.contentText).toBe("my version");
      const [n3] = await f.noteOf(i3.id);
      expect(n3!.contentText).toBe("third (changed)");

      // An edit after the import's last write (no editor JSON) is detected by updated_at.
      await tx.update(importCommitLog).set({ createdAt: sql`created_at - interval '1 hour'` }).where(sql`${importCommitLog.tableName} = 'notes' and ${importCommitLog.rowKey}->>'id' = ${n3!.id}`);
      await tx.update(notes).set({ title: "Renamed by me" }).where(eq(notes.id, n3!.id));
      await tx.execute(sql`update import_items set text = 'third, again' where id = ${i3.id}::uuid`);
      const r3 = await f.commit();
      expect(r3.notes.edited).toBe(2); // note 2 (still differs from Apple Notes) and note 3
      expect((await f.noteOf(i3.id))[0]!.title).toBe("Renamed by me");
    }),
  );

  it(
    "skips people deleted in The Network instead of recreating them",
    inTx(async (tx, f) => {
      const bor = await f.person("Bor Itest");
      await tx.update(people).set({ deletedAt: new Date() }).where(eq(people.id, bor));
      const pb = await f.proposal("bor", { matchPersonId: bor });
      const i = await f.item("bor note");
      await f.mention(i.id, pb.id, "primary");
      const r = await f.commit();
      expect(r.people.skipped).toEqual([expect.objectContaining({ key: pb.key, name: "Bor Itest" })]);
      expect(r.people.created).toBe(0);
      expect(r.notes.created).toBe(0);

      const pc = await f.proposal("cene");
      await f.commit({ keys: ["cene"] });
      const [committed] = await tx.select().from(importPeople).where(eq(importPeople.id, pc.id));
      await tx.update(people).set({ deletedAt: new Date() }).where(eq(people.id, committed!.committedPersonId!));
      await tx.update(importPeople).set({ status: "approved" }).where(eq(importPeople.id, pc.id)); // enriched by a later resolution
      const r2 = await f.commit({ keys: ["cene"] });
      expect(r2.people.skipped).toHaveLength(1);
      expect(await tx.select().from(people).where(and(eq(people.sourceRef, `import-person:${pc.id}`), isNull(people.deletedAt)))).toHaveLength(0);
    }),
  );

  it(
    "links introducers committed in a later run, through merge chains",
    inTx(async (tx, f) => {
      const b = await f.proposal("intro-b");
      await f.proposal("intro-m", { status: "merged", mergedIntoId: b.id });
      const a = await f.proposal("intro-a", { profile: { introducedByKey: `intro-m-${f.run}` } });
      expect((await f.commit({ keys: ["intro-a"] })).introductions).toBe(0);
      expect((await f.commit({ keys: ["intro-b"] })).introductions).toBe(1);
      const [pa] = await tx.select().from(importPeople).where(eq(importPeople.id, a.id));
      const [pb] = await tx.select().from(importPeople).where(eq(importPeople.id, b.id));
      const [row] = await tx.select({ introducedById: people.introducedById }).from(people).where(eq(people.id, pa!.committedPersonId!));
      expect(row!.introducedById).toBe(pb!.committedPersonId);
    }),
  );

  it(
    "merging into a committed proposal brings the merged profile to the person",
    inTx(async (tx, f) => {
      const into = await f.proposal("tine");
      await f.commit({ keys: ["tine"] });
      const from = await f.proposal("tine-2", { status: "proposed", decidedBy: null, profile: { role: "Designer", keyFacts: ["draws comics"] } });
      await mergeProposals(tx, f.ownerId, from.id, into.id);
      const [after] = await tx.select().from(importPeople).where(eq(importPeople.id, into.id));
      expect(after!.status).toBe("approved");
      await f.commit();
      const [p] = await tx.select({ headline: people.headline }).from(people).where(eq(people.id, after!.committedPersonId!));
      expect(p!.headline).toBe("Designer");
      const facts = await tx.select({ md: notes.contentMd }).from(notes).where(and(eq(notes.personId, after!.committedPersonId!), eq(notes.sourceKind, f.source)));
      expect(facts.map((x) => x.md).join("\n")).toContain("draws comics");
    }),
  );

  it(
    "rollback keeps shared rows still in use and refuses to cascade through user additions",
    inTx(async (tx, f) => {
      const tagName = `itest-tag-${f.run}`;
      await f.proposal("ula", { profile: { tags: [tagName] } });
      const r1 = await f.commit({ keys: ["ula"] });
      const [tag] = await tx.select().from(tags).where(and(eq(tags.ownerId, f.ownerId), eq(tags.name, tagName)));
      const yuki = await f.person("Yuki Itest");
      await tx.insert(personTags).values({ ownerId: f.ownerId, personId: yuki, tagId: tag!.id });
      const rb = await rollbackImport(tx, f.ownerId, { commitId: r1.commitId, dryRun: false });
      expect(rb.kept).toEqual({ tags: 1 });
      expect(await tx.select().from(tags).where(eq(tags.id, tag!.id))).toHaveLength(1);
      expect(rb.reverted["people:insert"]).toBe(1);

      const vid = await f.proposal("vid");
      const r2 = await f.commit({ keys: ["vid"] });
      const [pv] = await tx.select().from(importPeople).where(eq(importPeople.id, vid.id));
      await tx.insert(personTags).values({ ownerId: f.ownerId, personId: pv!.committedPersonId!, tagId: tag!.id });
      await expect(rollbackImport(tx, f.ownerId, { commitId: r2.commitId, dryRun: false })).rejects.toMatchObject({ status: 409 });
      expect(await tx.select().from(people).where(eq(people.id, pv!.committedPersonId!))).toHaveLength(1);
    }),
  );

  it(
    "inbox apply is atomic and replay-safe, and tolerates a partial met date",
    inTx(async (tx, f) => {
      const name = `Zala Itest ${f.run}`;
      const proposal = {
        noteSummary: "Met Zala",
        suggestedTitle: "Zala",
        occurredAt: null,
        candidates: [
          { name, aliases: [], role: "Founder", company: null, city: null, country: null, metContext: "at a conference", metDate: "2023-05", metCity: null, categories: [], warmth: null, circle: null, hobbies: [], introducedBy: null, keyFacts: ["builds drones"], howICanHelp: null, whatICanAsk: null, followUps: [{ what: "Call Zala", when: "next week" }], links: [], confidence: 0.9, matchPersonId: null, matchName: null },
        ],
      };
      const [cap] = await tx.insert(inboxItems).values({ ownerId: f.ownerId, text: `Met ${name} at a conference, call next week`, status: "proposed", proposal }).returning();
      const r1 = await applyInbox(f.ownerId, cap!.id, 0, tx);
      expect(r1).toMatchObject({ replayed: false });
      expect(r1.people).toHaveLength(1);
      expect(r1.noteId).toBeTruthy();
      const r2 = await applyInbox(f.ownerId, cap!.id, 0, tx);
      expect(r2).toMatchObject({ replayed: true, people: r1.people, noteId: r1.noteId });
      expect(await tx.select().from(people).where(and(eq(people.ownerId, f.ownerId), eq(people.displayName, name)))).toHaveLength(1);
      const [p] = await tx.select({ metAt: people.metAt, metContext: people.metContext }).from(people).where(eq(people.id, r1.people[0]!));
      expect(p).toEqual({ metAt: null, metContext: "at a conference (2023-05)" });
    }),
  );
});
