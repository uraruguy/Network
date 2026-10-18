/**
 * Batch decisions shown at the end of the review stack:
 *  - notes deleted from Apple Notes since the first export (gone_at set) that still have people →
 *    "import anyway" clears gone_at so they are filed and committed like any other note;
 *  - extracted notes with nobody worth a card → dismissed (skipped, `review:no_people`);
 *  - context folders (SF, Goolets, Amerika 2026) → tags on the proposals of the people in them
 *    (profile.tags; the commit creates the tags).
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { importItemsX, importPeople } from "@/lib/db/schema-import";
import { isPersonFolder } from "@/lib/import/folders";
import { deaccent, nameTokens } from "@/lib/import/names";
import { readProfile } from "@/lib/import/profile";
import type { DbOrTx } from "./import-shared";

/** Generic Apple Notes folders that make poor tags. */
const NOT_TAG_FOLDERS = ["notes", "meeting notes", "dnevno dogajanje", "razno", "locked", "recently deleted", "quick notes", "lajf", "misc"];
const fold = (s: string) => deaccent(s.normalize("NFC")).toLowerCase().trim();

/** A note that will be filed: it has a mention assigned to a live (non-rejected) person. */
const hasPeople = sql`exists (
  select 1 from import_mentions m join import_people p on p.id = m.import_person_id
  where m.item_id = import_items.id and p.disposition = 'person' and p.status <> 'rejected')`;

export type FolderTag = { name: string; notes: number; people: number; applied: number };
export type BatchSummary = {
  gone: { count: number; since: string | null; titles: string[] };
  noPeople: { count: number; titles: string[] };
  folders: FolderTag[];
};

export async function batchSummary(db: DbOrTx, ownerId: string, source: string): Promise<BatchSummary> {
  const gone = (await db.execute(sql`
    select title from import_items
    where owner_id = ${ownerId} and source = ${source} and gone_at is not null and status = 'extracted' and ${hasPeople}
    order by external_created_at desc nulls last`)) as unknown as { title: string | null }[];
  const [first] = (await db.execute(sql`select min(created_at) as at from import_jobs where owner_id = ${ownerId} and source = ${source}`)) as unknown as { at: string | null }[];
  const empty = (await db.execute(sql`
    select title from import_items
    where owner_id = ${ownerId} and source = ${source} and gone_at is null and status = 'extracted' and not ${hasPeople}
    order by external_created_at desc nulls last`)) as unknown as { title: string | null }[];

  // Folders of live notes with the people in them who are still open (proposed/approved).
  const rows = (await db.execute(sql`
    select f as folder, count(distinct i.id)::int as notes, count(distinct p.id)::int as people,
           count(distinct p.id) filter (where exists (select 1 from jsonb_array_elements_text(coalesce(p.profile->'tags', '[]'::jsonb)) t where lower(t) = lower(f)))::int as applied
    from import_items i
    cross join lateral unnest(i.folders) f
    join import_mentions m on m.item_id = i.id
    join import_people p on p.id = m.import_person_id and p.disposition = 'person' and p.status in ('proposed', 'approved')
    where i.owner_id = ${ownerId} and i.source = ${source} and i.gone_at is null and i.status in ('extracted', 'committed')
    group by f
    order by people desc, f`)) as unknown as { folder: string; notes: number; people: number; applied: number }[];
  // First names of open proposals: a folder named after a person ("Blaž", "Kaja") is not a context.
  const names = await db
    .select({ displayName: importPeople.displayName })
    .from(importPeople)
    .where(and(eq(importPeople.ownerId, ownerId), eq(importPeople.source, source)));
  const firstCounts = new Map<string, number>();
  for (const n of names) {
    const f = nameTokens(n.displayName)[0];
    if (f) firstCounts.set(f, (firstCounts.get(f) ?? 0) + 1);
  }
  const folders = rows
    .filter((r) => !NOT_TAG_FOLDERS.includes(fold(r.folder)) && !isPersonFolder(r.folder, firstCounts))
    .map((r) => ({ name: r.folder, notes: r.notes, people: r.people, applied: r.applied }));

  const titles = (xs: { title: string | null }[]) => xs.slice(0, 5).map((x) => x.title?.trim() || "Untitled");
  return {
    gone: { count: gone.length, since: first?.at ? new Date(first.at).toISOString() : null, titles: titles(gone) },
    noPeople: { count: empty.length, titles: titles(empty) },
    folders,
  };
}

/** Clears gone_at on deleted notes that still have people, so they are filed and committed. */
export async function restoreGone(db: DbOrTx, ownerId: string, source: string) {
  const rows = await db
    .update(importItemsX)
    .set({ goneAt: null })
    .where(and(eq(importItemsX.ownerId, ownerId), eq(importItemsX.source, source), sql`${importItemsX.goneAt} is not null`, eq(importItemsX.status, "extracted"), hasPeople))
    .returning({ id: importItemsX.id });
  return { restored: rows.length };
}

/** Dismisses extracted notes nobody in them is worth a card for. */
export async function dismissNoPeople(db: DbOrTx, ownerId: string, source: string) {
  const rows = await db
    .update(importItemsX)
    .set({ status: "skipped", dismissedReason: "review:no_people" })
    .where(and(eq(importItemsX.ownerId, ownerId), eq(importItemsX.source, source), sql`${importItemsX.goneAt} is null`, eq(importItemsX.status, "extracted"), sql`not ${hasPeople}`))
    .returning({ id: importItemsX.id });
  return { dismissed: rows.length };
}

/**
 * Adds (on) or removes (off) a folder's name as a tag on every open proposal mentioned in a live
 * note of that folder. Committed people are not touched (edit them in The Network).
 */
export async function setFolderTags(db: DbOrTx, ownerId: string, source: string, changes: { folder: string; on: boolean }[]) {
  let updated = 0;
  await db.transaction(async (tx) => {
    for (const { folder, on } of changes) {
      const ids = (await tx.execute(sql`
        select distinct p.id from import_people p
        join import_mentions m on m.import_person_id = p.id
        join import_items i on i.id = m.item_id
        where p.owner_id = ${ownerId} and p.source = ${source} and p.disposition = 'person' and p.status in ('proposed', 'approved')
          and i.gone_at is null and ${folder} = any(i.folders)`)) as unknown as { id: string }[];
      if (!ids.length) continue;
      const props = await tx
        .select({ id: importPeople.id, profile: importPeople.profile })
        .from(importPeople)
        .where(inArray(
          importPeople.id,
          ids.map((r) => r.id),
        ))
        .for("update");
      for (const p of props) {
        const tags = readProfile(p.profile).tags;
        const has = tags.some((t) => t.toLowerCase() === folder.toLowerCase());
        if (has === on) continue;
        const next = on ? [...tags, folder] : tags.filter((t) => t.toLowerCase() !== folder.toLowerCase());
        await tx
          .update(importPeople)
          .set({ profile: { ...(p.profile as object), tags: next } })
          .where(eq(importPeople.id, p.id));
        updated++;
      }
    }
  });
  return { updated };
}
