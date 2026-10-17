"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { api } from "@/lib/api";

/**
 * Chat threads (TanStack Query). The transcript itself is owned by the server: a thread is read
 * once when opened, then `useChat` streams new turns and the list is refreshed when a turn ends.
 */

export const chatKeys = {
  all: () => ["chat"] as const,
  threads: () => ["chat", "threads"] as const,
  thread: (id: string) => ["chat", "thread", id] as const,
};

export type ChatThread = { id: string; title: string | null; personId: string | null; createdAt: string; updatedAt: string };
export type ChatThreadDetail = ChatThread & { messages: UIMessage[] };

export function useChatThreads(opts: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: chatKeys.threads(), queryFn: () => api.get<ChatThread[]>("/api/chat/threads"), staleTime: 30_000, enabled: opts.enabled ?? true });
}

/** One thread with its messages. Disabled for `null` (a new, unsaved conversation). */
export function useChatThread(id: string | null) {
  return useQuery({
    queryKey: chatKeys.thread(id ?? "none"),
    queryFn: () => api.get<ChatThreadDetail>(`/api/chat/threads?id=${encodeURIComponent(id!)}`),
    enabled: !!id,
    // The live conversation is in useChat; only refetch when the thread is reopened.
    staleTime: Infinity,
    gcTime: 5 * 60_000,
  });
}

export function useDeleteChatThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/chat/threads?id=${encodeURIComponent(id)}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: chatKeys.threads() });
      const previous = qc.getQueryData<ChatThread[]>(chatKeys.threads());
      qc.setQueryData<ChatThread[]>(chatKeys.threads(), (list) => list?.filter((t) => t.id !== id));
      qc.removeQueries({ queryKey: chatKeys.thread(id) });
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(chatKeys.threads(), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chatKeys.threads() }),
  });
}

/**
 * Call when a turn finished: refreshes the thread list (order, title) and writes the live
 * transcript into the cached thread, so reopening it later shows the latest turn instantly.
 */
export function useChatTurnFinished() {
  const qc = useQueryClient();
  return (threadId: string, messages: UIMessage[]) => {
    const now = new Date().toISOString();
    qc.setQueryData<ChatThreadDetail>(chatKeys.thread(threadId), (old) =>
      old ? { ...old, messages, updatedAt: now } : { id: threadId, title: null, personId: null, createdAt: now, updatedAt: now, messages },
    );
    void qc.invalidateQueries({ queryKey: chatKeys.threads() });
  };
}
