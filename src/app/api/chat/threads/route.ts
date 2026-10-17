import { z } from "zod";
import { notFound, parseQuery, withOwner } from "@/lib/api-server";
import { deleteThread, getThread, listThreads } from "@/lib/data/chat";

const query = z.object({ id: z.string().uuid().optional() });

/** GET → recent threads; GET ?id= → one thread with its messages. */
export const GET = withOwner(async ({ ownerId, url }) => {
  const { id } = parseQuery(url, query);
  if (id) return (await getThread(ownerId, id)) ?? notFound();
  return listThreads(ownerId);
});

export const DELETE = withOwner(async ({ ownerId, url }) => {
  const { id } = parseQuery(url, query);
  if (id) await deleteThread(ownerId, id);
  return { ok: true };
});
