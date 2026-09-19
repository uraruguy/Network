import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const { chatThreads, chatMessages } = schema;

export async function listThreads(ownerId: string) {
  return db.query.chatThreads.findMany({ where: eq(chatThreads.ownerId, ownerId), orderBy: [desc(chatThreads.updatedAt)], limit: 50 });
}

export async function getThread(ownerId: string, id: string) {
  const t = await db.query.chatThreads.findFirst({ where: and(eq(chatThreads.ownerId, ownerId), eq(chatThreads.id, id)) });
  if (!t) return null;
  const messages = await db.query.chatMessages.findMany({ where: eq(chatMessages.threadId, id), orderBy: [asc(chatMessages.createdAt)] });
  return { ...t, messages };
}

export async function ensureThread(ownerId: string, id: string | undefined, personId?: string | null) {
  if (id) {
    const t = await db.query.chatThreads.findFirst({ where: and(eq(chatThreads.ownerId, ownerId), eq(chatThreads.id, id)) });
    if (t) return t;
  }
  const [t] = await db.insert(chatThreads).values({ ownerId, ...(id ? { id } : {}), personId: personId ?? null }).returning();
  return t!;
}

/** Replaces the stored transcript with the latest UI messages (simple, idempotent). */
export async function saveMessages(ownerId: string, threadId: string, messages: { id: string; role: string; parts: unknown }[], title?: string) {
  await db.delete(chatMessages).where(eq(chatMessages.threadId, threadId));
  if (messages.length) {
    await db.insert(chatMessages).values(
      messages.map((m, i) => ({
        id: /^[0-9a-f-]{36}$/.test(m.id) ? m.id : undefined,
        ownerId,
        threadId,
        role: (["user", "assistant", "system", "tool"].includes(m.role) ? m.role : "assistant") as "user" | "assistant" | "system" | "tool",
        parts: m.parts as object,
        createdAt: new Date(Date.now() - (messages.length - i) * 10),
      })),
    );
  }
  await db.update(chatThreads).set({ updatedAt: new Date(), ...(title ? { title } : {}) }).where(eq(chatThreads.id, threadId));
}

export async function deleteThread(ownerId: string, id: string) {
  await db.delete(chatThreads).where(and(eq(chatThreads.ownerId, ownerId), eq(chatThreads.id, id)));
}
