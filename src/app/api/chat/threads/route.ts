import { withOwner } from "@/lib/api-server";
import { deleteThread, getThread, listThreads } from "@/lib/data/chat";

export const GET = withOwner(async ({ ownerId, url }) => {
  const id = url.searchParams.get("id");
  if (id) return (await getThread(ownerId, id)) ?? { error: "Not found" };
  return listThreads(ownerId);
});

export const DELETE = withOwner(async ({ ownerId, url }) => {
  const id = url.searchParams.get("id");
  if (id) await deleteThread(ownerId, id);
  return { ok: true };
});
