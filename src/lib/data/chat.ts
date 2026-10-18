import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { qcol } from "./sql";

/**
 * Chat threads and messages. The server owns the transcript: the client sends only its newest
 * message, the route loads the thread here (one query), and after the reply streams it persists
 * just the new messages (upsert by id, so retries are idempotent).
 */

const { chatThreads, chatMessages } = schema;

export type StoredMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  parts: unknown[];
  /** Token usage and model of assistant messages (the `usage` column), as UI message metadata. */
  metadata?: Record<string, unknown>;
};

export type ThreadSummary = { id: string; title: string | null; personId: string | null; createdAt: Date; updatedAt: Date };

const threadColumns = {
  id: chatThreads.id,
  title: chatThreads.title,
  personId: chatThreads.personId,
  createdAt: chatThreads.createdAt,
  updatedAt: chatThreads.updatedAt,
};

/** Most recent threads first. */
export async function listThreads(ownerId: string, limit = 50): Promise<ThreadSummary[]> {
  return db.select(threadColumns).from(chatThreads).where(eq(chatThreads.ownerId, ownerId)).orderBy(desc(chatThreads.updatedAt)).limit(limit);
}

/** A thread with its whole transcript (oldest first) in one statement, or null if it isn't the owner's. */
export async function getThread(ownerId: string, id: string): Promise<(ThreadSummary & { messages: StoredMessage[] }) | null> {
  const [row] = await db
    .select({
      ...threadColumns,
      messages: sql<StoredMessage[]>`coalesce((
        select json_agg(json_build_object(
          'id', m.id, 'role', m.role, 'parts', m.parts,
          'metadata', m.usage
        ) order by m.created_at, m.id)
        from ${chatMessages} m where m.thread_id = ${qcol(chatThreads.id)} and m.owner_id = ${ownerId}
      ), '[]'::json)`,
    })
    .from(chatThreads)
    .where(and(eq(chatThreads.ownerId, ownerId), eq(chatThreads.id, id)));
  if (!row) return null;
  return { ...row, messages: row.messages.map((m) => (m.metadata ? m : { id: m.id, role: m.role, parts: m.parts })) };
}

/**
 * Creates a thread with a client-chosen id. Returns null when the id is already taken by a thread
 * this owner can't see — the caller must then refuse, never write into it.
 */
export async function createThread(ownerId: string, input: { id: string; personId?: string | null; title?: string | null }): Promise<ThreadSummary | null> {
  const [row] = await db
    .insert(chatThreads)
    .values({ id: input.id, ownerId, personId: input.personId ?? null, title: input.title ?? null })
    .onConflictDoNothing({ target: chatThreads.id })
    .returning(threadColumns);
  return row ?? null;
}

/**
 * Persists new messages of a thread (upsert by id) and bumps the thread. Timestamps keep the
 * given order even within the same millisecond.
 */
export async function saveMessages(ownerId: string, threadId: string, messages: (StoredMessage & { usage?: Record<string, unknown> | null })[]): Promise<void> {
  if (!messages.length) return;
  const base = Date.now();
  await db.transaction(async (tx) => {
    await tx
      .insert(chatMessages)
      .values(
        messages.map((m, i) => ({
          id: m.id,
          ownerId,
          threadId,
          role: m.role,
          parts: m.parts as object,
          usage: m.usage ?? null,
          createdAt: new Date(base + i),
        })),
      )
      .onConflictDoUpdate({
        target: chatMessages.id,
        set: { parts: sql`excluded.parts`, usage: sql`excluded.usage` },
        // Never touch a row that belongs to another owner or thread.
        setWhere: sql`${chatMessages.ownerId} = ${ownerId} and ${chatMessages.threadId} = ${threadId}`,
      });
    await tx.update(chatThreads).set({ updatedAt: new Date() }).where(and(eq(chatThreads.ownerId, ownerId), eq(chatThreads.id, threadId)));
  });
}

/** Removes specific messages of a thread (a regenerated answer replaces the old one). */
export async function deleteMessages(ownerId: string, threadId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db.delete(chatMessages).where(and(eq(chatMessages.ownerId, ownerId), eq(chatMessages.threadId, threadId), inArray(chatMessages.id, ids)));
}

export async function deleteThread(ownerId: string, id: string): Promise<boolean> {
  const rows = await db.delete(chatThreads).where(and(eq(chatThreads.ownerId, ownerId), eq(chatThreads.id, id))).returning({ id: chatThreads.id });
  return rows.length > 0;
}
