import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db as defaultDb, schema } from "@/lib/db";
import { importItemsX, importMentions, importPeople } from "@/lib/db/schema-import";
import { extractNote } from "@/lib/ai/import";
import { ExtractionV1 } from "@/lib/import/contracts";
import { isoDay } from "@/lib/import/dates";
import { contentHash } from "@/lib/import/diff";
import { normalizeExtraction } from "@/lib/import/mentions";
import { normName, personKey } from "@/lib/import/names";
import type { StoredExtraction } from "./import";
import { commitImport } from "./import-commit";
import { candidateProfile } from "./import-quick";
import { ImportError, type DbOrTx, type Tx } from "./import-shared";

const { inboxItems, importJobs, people } = schema;

/** Source of captures applied through the import commit path (commit log, notes, reminders). */
export const INBOX_SOURCE = "inbox";

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export async function listInbox(ownerId: string) {
  return defaultDb.query.inboxItems.findMany({ where: and(eq(inboxItems.ownerId, ownerId), inArray(inboxItems.status, ["new", "proposed"])), orderBy: [asc(inboxItems.createdAt)] });
}

export async function addInbox(ownerId: string, text: string, source = "app") {
  const [row] = await defaultDb.insert(inboxItems).values({ ownerId, text, source }).returning();
  return row!;
}

/** Runs extraction on an inbox item and stores the proposal (people to create/merge, note, follow-ups). */
export async function triageInbox(ownerId: string, id: string) {
  const it = await defaultDb.query.inboxItems.findFirst({ where: and(eq(inboxItems.ownerId, ownerId), eq(inboxItems.id, id)) });
  if (!it) return null;
  const existing = await defaultDb.query.people.findMany({ where: and(eq(people.ownerId, ownerId), isNull(people.deletedAt)), columns: { id: true, displayName: true } });
  const ex = await extractNote({ title: null, text: it.text, html: null, created: it.createdAt.toISOString(), folder: "Inbox", existingNames: existing.map((p) => p.displayName) });
  const proposal: StoredExtraction = {
    ...ex,
    candidates: ex.candidates.map((c) => {
      const m = existing.find((p) => norm(p.displayName) === norm(c.name)) ?? existing.find((p) => norm(p.displayName).split(" ")[0] === norm(c.name).split(" ")[0] && existing.filter((q) => norm(q.displayName).split(" ")[0] === norm(c.name).split(" ")[0]).length === 1);
      return { ...c, matchPersonId: m?.id ?? null, matchName: m?.displayName ?? null };
    }),
  };
  const [row] = await defaultDb.update(inboxItems).set({ proposal, status: "proposed" }).where(eq(inboxItems.id, id)).returning();
  return row!;
}

export type InboxApplyResult = { people: string[]; noteId: string | null; commitId: string | null; replayed: boolean };

/** What an applied capture produced: the people its proposals were committed into, and its note. */
async function appliedResult(tx: Tx, item: { id: string; noteId: string | null; decision: unknown } | undefined, fallbackPerson: string | null): Promise<InboxApplyResult> {
  if (!item) return { people: fallbackPerson ? [fallbackPerson] : [], noteId: null, commitId: null, replayed: true };
  // Applied by the earlier one-shot path: it recorded its result on the item.
  const legacy = item.decision as { resolved?: Record<string, string>; noteId?: string | null } | null;
  if (legacy?.resolved) return { people: [...new Set(Object.values(legacy.resolved))], noteId: legacy.noteId ?? item.noteId, commitId: null, replayed: true };
  const rows = await tx
    .selectDistinct({ personId: importPeople.committedPersonId })
    .from(importMentions)
    .innerJoin(importPeople, eq(importPeople.id, importMentions.importPersonId))
    .where(eq(importMentions.itemId, item.id));
  return { people: rows.map((r) => r.personId).filter((x): x is string => !!x), noteId: item.noteId, commitId: null, replayed: true };
}

/**
 * Applies a triaged capture through the import commit path, in one transaction: one approved
 * proposal per candidate (matched people get blanks filled, everyone else is created, a match the
 * user deleted is not recreated), the capture filed under the chosen person, every write in the
 * commit log (undoable like any import). Replay-safe: an applied capture returns its result again,
 * so offline replays and double taps don't fail or duplicate.
 */
export async function applyInbox(ownerId: string, id: string, primaryIndex = 0, db: DbOrTx = defaultDb): Promise<InboxApplyResult> {
  return db.transaction(async (tx) => {
    const [it] = await tx
      .select()
      .from(inboxItems)
      .where(and(eq(inboxItems.ownerId, ownerId), eq(inboxItems.id, id)))
      .for("update");
    if (!it) throw new ImportError(404, "Capture not found");
    const externalId = `inbox:${it.id}`;
    const [prev] = await tx
      .select({ id: importItemsX.id, status: importItemsX.status, noteId: importItemsX.noteId, decision: importItemsX.decision })
      .from(importItemsX)
      .where(and(eq(importItemsX.ownerId, ownerId), eq(importItemsX.externalId, externalId)));
    if (it.status === "applied" || prev?.status === "committed") {
      const done = await appliedResult(tx, prev, it.appliedPersonId);
      if (it.status !== "applied") await tx.update(inboxItems).set({ status: "applied", appliedPersonId: done.people[0] ?? null }).where(eq(inboxItems.id, it.id));
      return done;
    }
    const raw = ExtractionV1.safeParse(it.proposal);
    if (!it.proposal || !raw.success) throw new ImportError(409, "Nothing to apply yet — triage the capture first");
    const ex = normalizeExtraction(it.proposal, 1);
    if (!ex.candidates.length) throw new ImportError(422, "Nobody to file this capture under — dismiss it instead");

    // Match targets: the triage match if that person still exists, else a live person with the same name.
    const matchIds = [...new Set(raw.data.candidates.map((c) => c.matchPersonId).filter((x): x is string => !!x))];
    const found = matchIds.length ? await tx.select({ id: people.id, displayName: people.displayName, deletedAt: people.deletedAt }).from(people).where(and(eq(people.ownerId, ownerId), inArray(people.id, matchIds))) : [];
    const byId = new Map(found.map((p) => [p.id, p]));
    const targets: ({ matchPersonId: string | null } | { deleted: string })[] = [];
    for (const [i, c] of ex.candidates.entries()) {
      const m = byId.get(raw.data.candidates[i]?.matchPersonId ?? "");
      if (m?.deletedAt) targets.push({ deleted: m.displayName });
      else if (m) targets.push({ matchPersonId: m.id });
      else {
        const rows = (await tx.execute(sql`
          select id from people where owner_id = ${ownerId} and deleted_at is null and lower(unaccent(display_name)) = lower(unaccent(${c.name})) limit 1`)) as unknown as { id: string }[];
        targets.push({ matchPersonId: rows[0]?.id ?? null });
      }
    }
    const primary = primaryIndex >= 0 && primaryIndex < ex.candidates.length ? primaryIndex : 0;
    const primaryTarget = targets[primary]!;
    if ("deleted" in primaryTarget) throw new ImportError(409, `${primaryTarget.deleted} was deleted in The Network — restore them there, or dismiss this capture`);

    const now = new Date();
    const stamp = randomUUID();
    const day = isoDay(it.createdAt);
    let [job] = await tx.select({ id: importJobs.id }).from(importJobs).where(and(eq(importJobs.ownerId, ownerId), eq(importJobs.source, INBOX_SOURCE)));
    if (!job) [job] = await tx.insert(importJobs).values({ ownerId, source: INBOX_SOURCE, label: "Quick captures" }).returning({ id: importJobs.id });
    // Reuses the row a failed attempt of the earlier one-shot path may have left behind.
    const values = {
      jobId: job!.id,
      source: INBOX_SOURCE,
      title: ex.suggestedTitle,
      html: null,
      text: it.text,
      folder: "Inbox",
      folders: ["Inbox"],
      externalCreatedAt: it.createdAt,
      externalModifiedAt: it.createdAt,
      contentHash: contentHash(it.text),
      classification: "person",
      classificationConfidence: 1,
      candidates: it.proposal,
      extractionVersion: 1,
      status: "extracted" as const,
      screenedWith: INBOX_SOURCE,
      noteId: null,
      decision: null,
      error: null,
    };
    const [item] = await tx
      .insert(importItemsX)
      .values({ ownerId, externalId, ...values })
      .onConflictDoUpdate({ target: [importItemsX.ownerId, importItemsX.externalId], set: values })
      .returning({ id: importItemsX.id });
    const itemId = item!.id;
    await tx.delete(importMentions).where(eq(importMentions.itemId, itemId));

    // One approved proposal per candidate (Jakob applied the triage), keyed uniquely per capture.
    const keyOf = ex.candidates.map((c, i) => `${personKey(c.name).slice(0, 64).replace(/-+$/, "") || "person"}-${stamp.slice(0, 8)}-${i}`);
    const keyByName = new Map(ex.candidates.map((c, i) => [normName(c.name), keyOf[i]!]));
    const proposalOf = new Map<number, string>();
    for (const [i, c] of ex.candidates.entries()) {
      const target = targets[i]!;
      if ("deleted" in target) continue;
      const toks = c.name.trim().split(/\s+/);
      const introducedByKey = c.introducedBy ? (keyByName.get(normName(c.introducedBy)) ?? null) : null;
      const [row] = await tx
        .insert(importPeople)
        .values({
          ownerId,
          source: INBOX_SOURCE,
          key: keyOf[i]!,
          displayName: c.name,
          aliases: c.aliases.filter((a) => a !== c.name).slice(0, 20),
          disposition: "person",
          profile: { ...candidateProfile({ ...c, salience: c.salience ?? 0 }, itemId, day), introducedByKey, firstName: toks[0] ?? null, lastName: toks.length > 1 ? toks.slice(1).join(" ") : null },
          confidence: c.confidence,
          reasons: "Inbox capture",
          needsReview: false,
          status: "approved",
          decidedBy: "user",
          decidedAt: now,
          matchPersonId: target.matchPersonId,
          createReminder: true,
          engine: INBOX_SOURCE,
        })
        .returning({ id: importPeople.id });
      proposalOf.set(i, row!.id);
    }
    for (const [i, c] of ex.candidates.entries()) {
      const pid = proposalOf.get(i) ?? null;
      await tx.insert(importMentions).values({
        ownerId,
        itemId,
        candidateIndex: i,
        surface: c.name,
        importPersonId: pid,
        role: i === primary ? "primary" : "mention",
        confidence: c.confidence,
        reason: pid ? "inbox capture" : "dismissed: deleted in The Network",
      });
    }

    const keys = [...proposalOf.keys()].map((i) => keyOf[i]!);
    const report = await commitImport(tx, ownerId, { source: INBOX_SOURCE, dryRun: false, keys, itemIds: [itemId], now, commitId: stamp });
    const failed = [...report.people.failed.map((f) => `${f.key}: ${f.error}`), ...report.people.skipped.map((s) => s.reason), ...report.notes.failed.map((f) => f.error)];
    if (failed.length) throw new ImportError(500, `Could not apply the capture (${failed[0]})`);
    const [after] = await tx.select({ noteId: importItemsX.noteId }).from(importItemsX).where(eq(importItemsX.id, itemId));
    const primaryPerson = report.people.results.find((r) => r.proposalId === proposalOf.get(primary))?.personId ?? null;
    await tx.update(inboxItems).set({ status: "applied", appliedPersonId: primaryPerson }).where(eq(inboxItems.id, it.id));
    return { people: report.people.results.map((r) => r.personId), noteId: after?.noteId ?? null, commitId: report.commitId, replayed: false };
  });
}

export async function dismissInbox(ownerId: string, id: string) {
  await defaultDb.update(inboxItems).set({ status: "dismissed" }).where(and(eq(inboxItems.ownerId, ownerId), eq(inboxItems.id, id)));
}
