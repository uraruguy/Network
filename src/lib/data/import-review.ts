/**
 * Review queue for import proposals: list (paged, with evidence + similar-person suggestions),
 * decide (approve / reject / passerby / merge / split / edit / reopen / undo) and stats.
 * Every decision snapshots the previous state into import_people.history so it can be undone.
 */
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb, schema } from "@/lib/db";
import { importItemsX, importMentions, importPeople, type ImportPerson } from "@/lib/db/schema-import";
import { ProfileProposal, type ProfileProposal as Profile } from "@/lib/import/contracts";
import { nameTokens, personKey } from "@/lib/import/names";
import { mergeProfiles, readProfile } from "@/lib/import/profile";
import { fileNotes } from "./import-resolve";
import { ImportError as HttpError, type DbOrTx, type Tx } from "./import-shared";

export const REVIEW_TABS = ["review", "approved", "rejected", "committed", "merged", "all"] as const;
export type ReviewTab = (typeof REVIEW_TABS)[number];
export const PAGE_SIZE = 20;

/* ------------------------------------------------------------------ */
/*  Stats                                                              */
/* ------------------------------------------------------------------ */

export async function reviewStats(db: DbOrTx, ownerId: string, source: string) {
  const items = await db
    .select({ status: importItemsX.status, reason: sql<string | null>`split_part(coalesce(${importItemsX.dismissedReason}, ''), ':', 1)`, n: sql<number>`count(*)::int` })
    .from(importItemsX)
    .where(and(eq(importItemsX.ownerId, ownerId), eq(importItemsX.source, source), isNull(importItemsX.goneAt)))
    .groupBy(importItemsX.status, sql`2`);
  const props = await db
    .select({ status: importPeople.status, needsReview: importPeople.needsReview, n: sql<number>`count(*)::int` })
    .from(importPeople)
    .where(and(eq(importPeople.ownerId, ownerId), eq(importPeople.source, source)))
    .groupBy(importPeople.status, importPeople.needsReview);
  const [m] = (await db.execute(sql`
    select count(*)::int as total,
           count(*) filter (where m.import_person_id is null and m.candidate_index is not null and coalesce(m.reason, '') not like 'dismissed:%')::int as unassigned
    from import_mentions m join import_items i on i.id = m.item_id
    where m.owner_id = ${ownerId} and i.source = ${source} and i.gone_at is null`)) as unknown as [{ total: number; unassigned: number }];
  const itemCounts: Record<string, number> = {};
  const dismissed: Record<string, number> = {};
  for (const r of items) {
    itemCounts[r.status] = (itemCounts[r.status] ?? 0) + r.n;
    if (r.status === "skipped") dismissed[r.reason || "unknown"] = (dismissed[r.reason || "unknown"] ?? 0) + r.n;
  }
  const proposals = { review: 0, proposed: 0, approved: 0, rejected: 0, merged: 0, committed: 0, total: 0 };
  for (const r of props) {
    proposals[r.status] += r.n;
    proposals.total += r.n;
    if (r.status === "proposed" && r.needsReview) proposals.review += r.n;
  }
  return { source, items: itemCounts, dismissed, proposals, mentions: m };
}

/* ------------------------------------------------------------------ */
/*  List                                                               */
/* ------------------------------------------------------------------ */

function tabWhere(tab: ReviewTab) {
  switch (tab) {
    case "review":
      return and(eq(importPeople.status, "proposed"));
    case "approved":
    case "rejected":
    case "committed":
    case "merged":
      return eq(importPeople.status, tab);
    default:
      return undefined;
  }
}

export async function listProposals(db: DbOrTx, ownerId: string, source: string, tab: ReviewTab, cursor?: string | null) {
  const offset = Math.max(0, Number(cursor) || 0);
  const mentionCount = sql<number>`(select count(*)::int from import_mentions m where m.import_person_id = ${importPeople.id})`;
  const rows = await db
    .select({ p: importPeople, mentions: mentionCount, matchName: schema.people.displayName })
    .from(importPeople)
    .leftJoin(schema.people, eq(schema.people.id, importPeople.matchPersonId))
    .where(and(eq(importPeople.ownerId, ownerId), eq(importPeople.source, source), tabWhere(tab)))
    .orderBy(desc(mentionCount), asc(importPeople.key))
    .limit(PAGE_SIZE + 1)
    .offset(offset);
  const page = rows.slice(0, PAGE_SIZE);
  const ids = page.map((r) => r.p.id);

  // Evidence: up to 3 mentions per proposal (primary first, then by confidence).
  const evidence = ids.length
    ? ((await db.execute(sql`
        select * from (
          select m.id, m.import_person_id, m.item_id, m.surface, m.role, m.confidence, m.reason, coalesce(m.excerpt, m.evidence) as snippet,
                 i.title, i.folders, coalesce(i.external_created_at, i.created_at) as date,
                 row_number() over (partition by m.import_person_id order by (m.role = 'primary') desc, m.confidence desc nulls last) as rn
          from import_mentions m join import_items i on i.id = m.item_id
          where m.import_person_id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})
        ) x where rn <= 3`)) as unknown as {
        id: string;
        import_person_id: string;
        item_id: string;
        surface: string;
        role: string;
        confidence: number | null;
        reason: string | null;
        snippet: string | null;
        title: string | null;
        folders: string[];
        date: string;
      }[])
    : [];

  // Similar people: existing people and other live proposals sharing the first name (or trigram-similar).
  const similar = new Map<string, { kind: "person" | "proposal"; id: string; displayName: string; detail: string | null }[]>();
  for (const r of page) {
    const first = r.p.displayName.split(/\s+/)[0] ?? r.p.displayName;
    const people = (await db.execute(sql`
      select id, display_name, coalesce(headline, company) as detail from people
      where owner_id = ${ownerId} and deleted_at is null
        and (lower(unaccent(split_part(display_name, ' ', 1))) = lower(unaccent(${first})) or similarity(display_name, ${r.p.displayName}) > 0.45)
      order by similarity(display_name, ${r.p.displayName}) desc limit 3`)) as unknown as { id: string; display_name: string; detail: string | null }[];
    const others = await db
      .select({ id: importPeople.id, displayName: importPeople.displayName, status: importPeople.status })
      .from(importPeople)
      .where(
        and(
          eq(importPeople.ownerId, ownerId),
          eq(importPeople.source, source),
          ne(importPeople.id, r.p.id),
          ne(importPeople.status, "merged"),
          sql`lower(unaccent(split_part(${importPeople.displayName}, ' ', 1))) = lower(unaccent(${first}))`,
        ),
      )
      .limit(4);
    similar.set(r.p.id, [
      ...people.map((p) => ({ kind: "person" as const, id: p.id, displayName: p.display_name, detail: p.detail })),
      ...others.map((o) => ({ kind: "proposal" as const, id: o.id, displayName: o.displayName, detail: o.status })),
    ]);
  }

  return {
    tab,
    items: page.map((r) => ({
      id: r.p.id,
      key: r.p.key,
      displayName: r.p.displayName,
      aliases: r.p.aliases,
      disposition: r.p.disposition,
      status: r.p.status,
      needsReview: r.p.needsReview,
      confidence: r.p.confidence,
      reasons: r.p.reasons,
      reviewFlags: r.p.reviewFlags,
      decidedBy: r.p.decidedBy,
      createReminder: r.p.createReminder,
      matchPerson: r.p.matchPersonId ? { id: r.p.matchPersonId, displayName: r.matchName } : null,
      committedPersonId: r.p.committedPersonId,
      mergedIntoId: r.p.mergedIntoId,
      profile: readProfile(r.p.profile),
      mentionCount: r.mentions,
      canUndo: Array.isArray(r.p.history) && r.p.history.length > 0,
      evidence: evidence
        .filter((e) => e.import_person_id === r.p.id)
        .map((e) => ({ mentionId: e.id, itemId: e.item_id, title: e.title, folders: e.folders, date: e.date, surface: e.surface, role: e.role, confidence: e.confidence, snippet: e.snippet })),
      similar: similar.get(r.p.id) ?? [],
    })),
    nextCursor: rows.length > PAGE_SIZE ? String(offset + PAGE_SIZE) : null,
  };
}

/* ------------------------------------------------------------------ */
/*  Decide                                                             */
/* ------------------------------------------------------------------ */

export const decisionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject") }),
  z.object({ action: z.literal("passerby") }),
  z.object({ action: z.literal("reopen") }),
  z.object({ action: z.literal("undo") }),
  z.object({ action: z.literal("merge"), intoId: z.string().uuid() }),
  z.object({ action: z.literal("split"), mentionIds: z.array(z.string().uuid()).min(1), displayName: z.string().trim().min(1).max(200) }),
  z.object({
    action: z.literal("edit"),
    displayName: z.string().trim().min(1).max(200).optional(),
    aliases: z.array(z.string().trim().min(1).max(120)).optional(),
    profile: ProfileProposal.partial().optional(),
    matchPersonId: z.string().uuid().nullable().optional(),
    createReminder: z.boolean().optional(),
  }),
]);
export type DecisionInput = z.infer<typeof decisionInput>;

type Snapshot = Pick<ImportPerson, "status" | "disposition" | "needsReview" | "decidedBy" | "displayName" | "aliases" | "profile" | "matchPersonId" | "mergedIntoId" | "createReminder"> & { decidedAt: string | null };
type HistoryEntry = {
  at: string;
  action: DecisionInput["action"];
  prev: Snapshot;
  moved?: { mentionIds: string[]; to: string };
  intoPrev?: { id: string; aliases: string[]; profile: unknown };
  splitInto?: string;
};

const snap = (p: ImportPerson): Snapshot => ({
  status: p.status,
  disposition: p.disposition,
  needsReview: p.needsReview,
  decidedBy: p.decidedBy,
  decidedAt: p.decidedAt ? p.decidedAt.toISOString() : null,
  displayName: p.displayName,
  aliases: p.aliases,
  profile: p.profile,
  matchPersonId: p.matchPersonId,
  mergedIntoId: p.mergedIntoId,
  createReminder: p.createReminder,
});

async function lockProposal(tx: Tx, ownerId: string, id: string) {
  const [p] = await tx
    .select()
    .from(importPeople)
    .where(and(eq(importPeople.ownerId, ownerId), eq(importPeople.id, id)))
    .for("update");
  if (!p) throw new HttpError(404, "Proposal not found");
  return p;
}

const pushHistory = (p: ImportPerson, entry: HistoryEntry) => [...((p.history as HistoryEntry[]) ?? []), entry].slice(-20);
const userDecided = () => ({ decidedBy: "user" as const, decidedAt: new Date(), needsReview: false });

async function itemsOf(tx: Tx, proposalIds: string[]) {
  if (!proposalIds.length) return [];
  const rows = await tx.selectDistinct({ itemId: importMentions.itemId }).from(importMentions).where(inArray(importMentions.importPersonId, proposalIds));
  return rows.map((r) => r.itemId);
}

export async function mergeProposals(tx: Tx, ownerId: string, fromId: string, intoId: string, history = true) {
  if (fromId === intoId) throw new HttpError(422, "Cannot merge a proposal into itself");
  const from = await lockProposal(tx, ownerId, fromId);
  const into = await lockProposal(tx, ownerId, intoId);
  if (from.status === "committed") throw new HttpError(409, "Already committed — merge the people in The Network instead");
  if (into.status === "merged") throw new HttpError(409, "Target was merged into another proposal");
  const moved = await tx
    .update(importMentions)
    .set({ importPersonId: into.id, originalImportPersonId: sql`coalesce(${importMentions.originalImportPersonId}, ${from.id}::uuid)` })
    .where(eq(importMentions.importPersonId, from.id))
    .returning({ id: importMentions.id });
  await tx
    .update(importPeople)
    .set({
      aliases: [...new Set([...into.aliases, from.displayName, ...from.aliases])].filter((a) => a !== into.displayName),
      profile: { ...(into.profile as object), ...mergeProfiles(readProfile(into.profile), readProfile(from.profile)) },
      matchPersonId: into.matchPersonId ?? from.matchPersonId,
      reviewFlags: into.reviewFlags.filter((f) => f !== "possible_duplicate"),
    })
    .where(eq(importPeople.id, into.id));
  await tx
    .update(importPeople)
    .set({
      status: "merged",
      mergedIntoId: into.id,
      ...userDecided(),
      history: history
        ? pushHistory(from, { at: new Date().toISOString(), action: "merge", prev: snap(from), moved: { mentionIds: moved.map((m) => m.id), to: into.id }, intoPrev: { id: into.id, aliases: into.aliases, profile: into.profile } })
        : from.history,
    })
    .where(eq(importPeople.id, from.id));
  return { moved: moved.length, into };
}

export async function splitProposal(tx: Tx, ownerId: string, id: string, mentionIds: string[], displayName: string) {
  const p = await lockProposal(tx, ownerId, id);
  if (p.status === "committed") throw new HttpError(409, "Already committed");
  const owned = await tx
    .select({ id: importMentions.id })
    .from(importMentions)
    .where(and(eq(importMentions.importPersonId, p.id), inArray(importMentions.id, mentionIds)));
  if (owned.length !== mentionIds.length) throw new HttpError(422, "Some mentions do not belong to this proposal");
  let key = personKey(displayName);
  for (let i = 2; (await tx.select({ id: importPeople.id }).from(importPeople).where(and(eq(importPeople.ownerId, ownerId), eq(importPeople.source, p.source), eq(importPeople.key, key)))).length; i++) {
    key = `${personKey(displayName)}-${i}`;
  }
  const toks = displayName.trim().split(/\s+/);
  const [created] = await tx
    .insert(importPeople)
    .values({
      ownerId,
      source: p.source,
      key,
      displayName,
      aliases: [],
      disposition: "person",
      profile: { firstName: toks[0] ?? null, lastName: toks.length > 1 ? toks.slice(1).join(" ") : null },
      confidence: 1,
      reasons: `Split from ${p.displayName} by Jakob`,
      status: "approved",
      ...userDecided(),
      engine: "user",
    })
    .returning();
  await tx
    .update(importMentions)
    .set({ importPersonId: created!.id, originalImportPersonId: sql`coalesce(${importMentions.originalImportPersonId}, ${p.id}::uuid)` })
    .where(inArray(importMentions.id, mentionIds));
  await tx
    .update(importPeople)
    .set({ history: pushHistory(p, { at: new Date().toISOString(), action: "split", prev: snap(p), moved: { mentionIds, to: created!.id }, splitInto: created!.id }) })
    .where(eq(importPeople.id, p.id));
  return created!;
}

async function undo(tx: Tx, ownerId: string, p: ImportPerson) {
  const hist = (p.history as HistoryEntry[]) ?? [];
  const last = hist.at(-1);
  if (!last) throw new HttpError(409, "Nothing to undo");
  if (p.status === "committed") throw new HttpError(409, "Already committed — roll back the commit instead");
  if (last.moved) {
    if (last.splitInto) {
      const [child] = await tx.select().from(importPeople).where(eq(importPeople.id, last.splitInto));
      if (child?.status === "committed") throw new HttpError(409, "The split-off person was already committed");
    }
    await tx
      .update(importMentions)
      .set({ importPersonId: p.id, originalImportPersonId: null })
      .where(and(inArray(importMentions.id, last.moved.mentionIds), eq(importMentions.importPersonId, last.moved.to)));
    if (last.splitInto) await tx.delete(importPeople).where(and(eq(importPeople.id, last.splitInto), ne(importPeople.status, "committed")));
  }
  if (last.intoPrev) await tx.update(importPeople).set({ aliases: last.intoPrev.aliases, profile: last.intoPrev.profile }).where(eq(importPeople.id, last.intoPrev.id));
  const prev = last.prev;
  await tx
    .update(importPeople)
    .set({ ...prev, decidedAt: prev.decidedAt ? new Date(prev.decidedAt) : null, history: hist.slice(0, -1) })
    .where(eq(importPeople.id, p.id));
}

/** Applies one review decision; re-files the notes it touches. */
export async function decideProposal(ownerId: string, id: string, input: DecisionInput, db: DbOrTx = defaultDb) {
  return db.transaction(async (tx) => {
    const p = await lockProposal(tx, ownerId, id);
    if (p.status === "committed") throw new HttpError(409, "Already committed — change the person in The Network or roll the commit back");
    const entry = (): HistoryEntry => ({ at: new Date().toISOString(), action: input.action, prev: snap(p) });
    const affected = new Set([p.id]);
    switch (input.action) {
      case "approve":
        await tx.update(importPeople).set({ status: "approved", disposition: "person", ...userDecided(), history: pushHistory(p, entry()) }).where(eq(importPeople.id, p.id));
        break;
      case "reject":
        await tx.update(importPeople).set({ status: "rejected", ...userDecided(), history: pushHistory(p, entry()) }).where(eq(importPeople.id, p.id));
        break;
      case "passerby":
        await tx.update(importPeople).set({ status: "rejected", disposition: "passerby", ...userDecided(), history: pushHistory(p, entry()) }).where(eq(importPeople.id, p.id));
        break;
      case "reopen":
        await tx.update(importPeople).set({ status: "proposed", needsReview: true, decidedBy: null, decidedAt: null, history: pushHistory(p, entry()) }).where(eq(importPeople.id, p.id));
        break;
      case "merge": {
        const r = await mergeProposals(tx, ownerId, p.id, input.intoId);
        affected.add(r.into.id);
        break;
      }
      case "split": {
        const created = await splitProposal(tx, ownerId, p.id, input.mentionIds, input.displayName);
        affected.add(created.id);
        break;
      }
      case "edit": {
        let profile: Record<string, unknown> | undefined = input.profile ? { ...(p.profile as object), ...readProfileMerge(readProfile(p.profile), input.profile) } : undefined;
        if (input.displayName) profile = { ...(profile ?? (p.profile as object)), ...splitName(input.displayName) };
        await tx
          .update(importPeople)
          .set({
            displayName: input.displayName,
            aliases: input.aliases,
            profile,
            matchPersonId: input.matchPersonId,
            createReminder: input.createReminder,
            history: pushHistory(p, entry()),
          })
          .where(eq(importPeople.id, p.id));
        break;
      }
      case "undo": {
        const last = ((p.history as HistoryEntry[]) ?? []).at(-1);
        if (last?.intoPrev) affected.add(last.intoPrev.id);
        if (last?.splitInto) affected.add(last.splitInto);
        await undo(tx, ownerId, p);
        break;
      }
    }
    if (input.action !== "edit") {
      const items = await itemsOf(tx, [...affected]);
      if (items.length) await fileNotes(tx, ownerId, p.source, { itemIds: items });
    }
    const [after] = await tx.select().from(importPeople).where(eq(importPeople.id, p.id));
    return after!;
  });
}

function readProfileMerge(cur: Profile, patch: Partial<Profile>): Profile {
  const out = { ...cur } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) out[k] = v;
  return out as Profile;
}

function splitName(displayName: string) {
  const toks = nameTokens(displayName).length ? displayName.trim().split(/\s+/) : [];
  return { firstName: toks[0] ?? null, lastName: toks.length > 1 ? toks.slice(1).join(" ") : null };
}

/* ------------------------------------------------------------------ */
/*  Item detail (lazy-loaded note text for the review UI)              */
/* ------------------------------------------------------------------ */

export async function getImportItem(db: DbOrTx, ownerId: string, id: string) {
  const [it] = await db
    .select({
      id: importItemsX.id,
      title: importItemsX.title,
      html: importItemsX.html,
      text: importItemsX.text,
      folders: importItemsX.folders,
      status: importItemsX.status,
      classification: importItemsX.classification,
      dismissedReason: importItemsX.dismissedReason,
      noteId: importItemsX.noteId,
      externalCreatedAt: importItemsX.externalCreatedAt,
    })
    .from(importItemsX)
    .where(and(eq(importItemsX.ownerId, ownerId), eq(importItemsX.id, id)));
  if (!it) return null;
  const mentions = await db
    .select({ id: importMentions.id, surface: importMentions.surface, role: importMentions.role, confidence: importMentions.confidence, personKey: importPeople.key, displayName: importPeople.displayName, status: importPeople.status })
    .from(importMentions)
    .leftJoin(importPeople, eq(importPeople.id, importMentions.importPersonId))
    .where(eq(importMentions.itemId, id));
  return { ...it, mentions };
}
