import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { extractNote } from "@/lib/ai/import";
import { commitItem, type StoredExtraction } from "./import";

const { inboxItems, importJobs, importItems, people } = schema;

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export async function listInbox(ownerId: string) {
  return db.query.inboxItems.findMany({ where: and(eq(inboxItems.ownerId, ownerId), inArray(inboxItems.status, ["new", "proposed"])), orderBy: [asc(inboxItems.createdAt)] });
}

export async function addInbox(ownerId: string, text: string, source = "app") {
  const [row] = await db.insert(inboxItems).values({ ownerId, text, source }).returning();
  return row!;
}

/** Runs extraction on an inbox item and stores the proposal (people to create/merge, note, follow-ups). */
export async function triageInbox(ownerId: string, id: string) {
  const it = await db.query.inboxItems.findFirst({ where: and(eq(inboxItems.ownerId, ownerId), eq(inboxItems.id, id)) });
  if (!it) return null;
  const existing = await db.query.people.findMany({ where: and(eq(people.ownerId, ownerId), isNull(people.deletedAt)), columns: { id: true, displayName: true } });
  const ex = await extractNote({ title: null, text: it.text, html: null, created: it.createdAt.toISOString(), folder: "Inbox", existingNames: existing.map((p) => p.displayName) });
  const proposal: StoredExtraction = {
    ...ex,
    candidates: ex.candidates.map((c) => {
      const m = existing.find((p) => norm(p.displayName) === norm(c.name)) ?? existing.find((p) => norm(p.displayName).split(" ")[0] === norm(c.name).split(" ")[0] && existing.filter((q) => norm(q.displayName).split(" ")[0] === norm(c.name).split(" ")[0]).length === 1);
      return { ...c, matchPersonId: m?.id ?? null, matchName: m?.displayName ?? null };
    }),
  };
  const [row] = await db.update(inboxItems).set({ proposal, status: "proposed" }).where(eq(inboxItems.id, id)).returning();
  return row!;
}

/** Applies a proposal by funnelling it through the import commit path (same code, same guarantees). */
export async function applyInbox(ownerId: string, id: string, primaryIndex = 0) {
  const it = await db.query.inboxItems.findFirst({ where: and(eq(inboxItems.ownerId, ownerId), eq(inboxItems.id, id)) });
  if (!it || !it.proposal) throw new Error("Nothing to apply");
  const ex = it.proposal as StoredExtraction;
  let job = await db.query.importJobs.findFirst({ where: and(eq(importJobs.ownerId, ownerId), eq(importJobs.source, "inbox")) });
  if (!job) [job] = await db.insert(importJobs).values({ ownerId, source: "inbox", label: "Quick captures" }).returning();
  const [item] = await db
    .insert(importItems)
    .values({ ownerId, jobId: job!.id, externalId: `inbox:${it.id}`, title: ex.suggestedTitle, text: it.text, folder: "Inbox", externalCreatedAt: it.createdAt, candidates: ex, classification: "person", status: "extracted" })
    .returning();
  const result = await commitItem(ownerId, item!.id, {
    candidates: ex.candidates.map((c, i) => ({ index: i, action: c.matchPersonId ? "merge" : "create", personId: c.matchPersonId })),
    primaryIndex: ex.candidates.length ? primaryIndex : null,
    createReminders: true,
    noteKind: "note",
  });
  await db.update(inboxItems).set({ status: "applied", appliedPersonId: result.people[0] ?? null }).where(eq(inboxItems.id, id));
  return result;
}

export async function dismissInbox(ownerId: string, id: string) {
  await db.update(inboxItems).set({ status: "dismissed" }).where(and(eq(inboxItems.ownerId, ownerId), eq(inboxItems.id, id)));
}
