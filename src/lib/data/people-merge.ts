import "server-only";
import { and, eq, isNull, like, sql } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { importPeople } from "@/lib/db/schema-import";
import { HttpError } from "@/lib/errors";
import { mdToText, mergeFactsMd } from "./import-commit";
import { inTransaction, type Tx } from "./import-shared";

type Person = typeof schema.people.$inferSelect;

/** Scalar columns a merge copies from the duplicate when the kept person has them blank. */
export const FILL_FIELDS = [
  "firstName",
  "lastName",
  "avatarUrl",
  "headline",
  "company",
  "homeLocationId",
  "metContext",
  "metAt",
  "metLocationId",
  "introducedById",
  "circle",
  "hobbiesOther",
  "email",
  "phone",
  "linkedin",
  "xHandle",
  "instagram",
  "website",
  "birthday",
  "howICanHelp",
  "whatICanAsk",
  "followupCadenceDays",
] as const satisfies readonly (keyof Person)[];

const ARRAY_FIELDS = ["hobbies", "languages", "interests"] as const satisfies readonly (keyof Person)[];

/**
 * What the kept person gains from the duplicate: blank scalars filled, list fields unioned, the
 * later last interaction. Never overwrites a value the kept person already has, and never points
 * the kept person's introducer at either of the two. Pure.
 */
export function mergePatch(keep: Person, drop: Person): Partial<Person> {
  const patch: Partial<Person> = {};
  const blank = (v: unknown) => v == null || v === "";
  for (const f of FILL_FIELDS) if (blank(keep[f]) && !blank(drop[f])) (patch as Record<string, unknown>)[f] = drop[f];
  if (patch.introducedById === keep.id || patch.introducedById === drop.id) delete patch.introducedById;
  for (const f of ARRAY_FIELDS) {
    const union = [...new Set([...keep[f], ...drop[f]])];
    if (union.length !== keep[f].length) patch[f] = union;
  }
  if (drop.lastInteractionAt && (!keep.lastInteractionAt || drop.lastInteractionAt > keep.lastInteractionAt)) patch.lastInteractionAt = drop.lastInteractionAt;
  return patch;
}

export type MergeReport = {
  keep: { id: string; name: string };
  drop: { id: string; name: string };
  fields: string[];
  moved: Record<string, number>;
  factsMerged: boolean;
  dryRun: boolean;
};

const FACTS_PREFIX = "apple-notes:facts:";

/**
 * Merges person `dropId` into `keepId` (same owner) in one transaction: notes, mentions,
 * reminders, chat threads, categories/tags/activities and introductions move over; two imported
 * key-facts notes become one; blank fields are filled; import proposals point at the kept person
 * (so a re-import fills them instead of recreating the duplicate); the duplicate is soft-deleted.
 * Without `write` everything is rolled back and only the report is returned.
 */
export async function mergePeople(db: Db, ownerId: string, keepId: string, dropId: string, opts: { write: boolean }): Promise<MergeReport> {
  if (keepId === dropId) throw new HttpError(422, "Pick two different people");
  return inTransaction(db, opts.write, async (tx: Tx) => {
    const p = schema.people;
    const rows = await tx
      .select()
      .from(p)
      .where(and(eq(p.ownerId, ownerId), isNull(p.deletedAt), sql`${p.id} in (${keepId}::uuid, ${dropId}::uuid)`))
      .for("update");
    const keep = rows.find((r) => r.id === keepId);
    const drop = rows.find((r) => r.id === dropId);
    if (!keep || !drop) throw new HttpError(404, "Both people must exist and not be deleted");

    const moved: Record<string, number> = {};
    const count = (k: string, r: unknown) => (moved[k] = (r as { count?: number }).count ?? 0);

    // Two imported key-facts notes → one (unless the kept one was edited in the app).
    let factsMerged = false;
    const n = schema.notes;
    const facts = (personId: string) =>
      tx
        .select({ id: n.id, contentMd: n.contentMd, contentJson: n.contentJson })
        .from(n)
        .where(and(eq(n.ownerId, ownerId), eq(n.personId, personId), isNull(n.deletedAt), like(n.sourceRef, `${FACTS_PREFIX}%`)))
        .limit(1);
    const [keepFacts] = await facts(keepId);
    const [dropFacts] = await facts(dropId);
    if (keepFacts && dropFacts && keepFacts.contentJson == null) {
      const merged = mergeFactsMd(keepFacts.contentMd, dropFacts.contentMd);
      await tx.update(n).set({ contentMd: merged, contentText: mdToText(merged), updatedAt: new Date() }).where(eq(n.id, keepFacts.id));
      await tx.update(n).set({ deletedAt: new Date() }).where(eq(n.id, dropFacts.id));
      factsMerged = true;
    }

    count("notes", await tx.execute(sql`update notes set person_id = ${keepId} where owner_id = ${ownerId} and person_id = ${dropId} and deleted_at is null`));
    count("reminders", await tx.execute(sql`update reminders set person_id = ${keepId} where owner_id = ${ownerId} and person_id = ${dropId}`));
    count("chat_threads", await tx.execute(sql`update chat_threads set person_id = ${keepId} where owner_id = ${ownerId} and person_id = ${dropId}`));
    count("mentions", await tx.execute(sql`
      insert into note_mentions (owner_id, note_id, person_id)
      select m.owner_id, m.note_id, ${keepId}::uuid from note_mentions m join notes nt on nt.id = m.note_id
      where m.owner_id = ${ownerId} and m.person_id = ${dropId} and nt.person_id <> ${keepId}
      on conflict do nothing`));
    await tx.execute(sql`delete from note_mentions where owner_id = ${ownerId} and person_id = ${dropId}`);
    for (const t of ["person_categories", "person_tags", "person_activities"] as const) {
      const col = t === "person_categories" ? "category_id" : t === "person_tags" ? "tag_id" : "activity_id";
      count(t, await tx.execute(sql`
        insert into ${sql.identifier(t)} (owner_id, person_id, ${sql.identifier(col)})
        select owner_id, ${keepId}::uuid, ${sql.identifier(col)} from ${sql.identifier(t)} where owner_id = ${ownerId} and person_id = ${dropId}
        on conflict do nothing`));
      await tx.execute(sql`delete from ${sql.identifier(t)} where owner_id = ${ownerId} and person_id = ${dropId}`);
    }
    count("introduced", await tx.execute(sql`update people set introduced_by_id = ${keepId} where owner_id = ${ownerId} and introduced_by_id = ${dropId} and id <> ${keepId}`));
    const ip = importPeople;
    count("import_proposals", await tx.update(ip).set({ committedPersonId: keepId }).where(and(eq(ip.ownerId, ownerId), eq(ip.committedPersonId, dropId))));
    await tx.update(ip).set({ matchPersonId: keepId }).where(and(eq(ip.ownerId, ownerId), eq(ip.matchPersonId, dropId)));

    const patch = mergePatch(keep, drop);
    if (keep.introducedById === dropId) patch.introducedById = null;
    if (Object.keys(patch).length) await tx.update(p).set({ ...patch, updatedAt: new Date() }).where(eq(p.id, keepId));
    await tx.update(p).set({ deletedAt: new Date(), introducedById: null }).where(eq(p.id, dropId));

    return {
      keep: { id: keepId, name: keep.displayName },
      drop: { id: dropId, name: drop.displayName },
      fields: Object.keys(patch),
      moved,
      factsMerged,
      dryRun: !opts.write,
    };
  });
}
