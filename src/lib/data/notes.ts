import { and, desc, eq, ilike, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { NoteData, NotePatchData } from "@/lib/schemas";

const { notes, noteMentions, people } = schema;

export async function getNote(ownerId: string, id: string) {
  const row = await db.query.notes.findFirst({
    where: and(eq(notes.ownerId, ownerId), eq(notes.id, id), isNull(notes.deletedAt)),
    with: { mentions: { with: { person: { columns: { id: true, displayName: true, avatarUrl: true } } } } },
  });
  if (!row) return null;
  const { mentions, ...rest } = row;
  return { ...rest, mentions: mentions.map((m) => m.person) };
}

async function setMentions(ownerId: string, noteId: string, personIds: string[]) {
  await db.delete(noteMentions).where(eq(noteMentions.noteId, noteId));
  if (personIds.length) {
    const valid = await db.select({ id: people.id }).from(people).where(and(eq(people.ownerId, ownerId), inArray(people.id, personIds)));
    if (valid.length) await db.insert(noteMentions).values(valid.map((p) => ({ ownerId, noteId, personId: p.id })));
  }
}

export async function createNote(ownerId: string, input: NoteData, source?: { kind: string; ref: string }) {
  const { mentionIds, occurredAt, ...cols } = input;
  const [row] = await db
    .insert(notes)
    .values({
      ownerId,
      ...cols,
      contentJson: cols.contentJson ?? null,
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      sourceKind: source?.kind ?? null,
      sourceRef: source?.ref ?? null,
    })
    .returning();
  await setMentions(ownerId, row!.id, mentionIds);
  return (await getNote(ownerId, row!.id))!;
}

export async function updateNote(ownerId: string, id: string, patch: NotePatchData) {
  const { mentionIds, occurredAt, ...cols } = patch;
  const values: Partial<schema.NewNote> = { ...cols, contentJson: cols.contentJson === undefined ? undefined : (cols.contentJson ?? null) };
  if (occurredAt) values.occurredAt = new Date(occurredAt);
  if (Object.keys(values).length) await db.update(notes).set(values).where(and(eq(notes.ownerId, ownerId), eq(notes.id, id)));
  if (mentionIds) await setMentions(ownerId, id, mentionIds);
  return getNote(ownerId, id);
}

export async function deleteNote(ownerId: string, id: string) {
  await db.update(notes).set({ deletedAt: new Date() }).where(and(eq(notes.ownerId, ownerId), eq(notes.id, id)));
}

export async function recentNotes(ownerId: string, limit = 10) {
  return db.query.notes.findMany({
    where: and(eq(notes.ownerId, ownerId), isNull(notes.deletedAt)),
    orderBy: [desc(notes.updatedAt)],
    limit,
    columns: { id: true, personId: true, title: true, contentText: true, kind: true, occurredAt: true, updatedAt: true },
    with: { person: { columns: { id: true, displayName: true, avatarUrl: true } } },
  });
}

export async function searchNotes(ownerId: string, q: string, limit = 20) {
  return db.query.notes.findMany({
    where: and(eq(notes.ownerId, ownerId), isNull(notes.deletedAt), ilike(notes.contentText, `%${q}%`)),
    orderBy: [desc(notes.occurredAt)],
    limit,
    columns: { id: true, personId: true, title: true, contentText: true, kind: true, occurredAt: true },
    with: { person: { columns: { id: true, displayName: true } } },
  });
}
