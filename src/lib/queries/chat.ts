"use client";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { api } from "@/lib/api";

/**
 * Chat threads (TanStack Query). The transcript itself is owned by the server: a thread is read
 * once when opened, then `useChat` streams new turns and the list is refreshed when a turn ends.
 * Nothing under ["chat"] is ever written to IndexedDB (query defaults below, and the persister
 * excludes the key root too): transcripts stay in memory, briefly.
 */

export const chatKeys = {
  all: () => ["chat"] as const,
  threads: () => ["chat", "threads"] as const,
  thread: (id: string) => ["chat", "thread", id] as const,
};

export type ChatThread = { id: string; title: string | null; personId: string | null; createdAt: string; updatedAt: string };
export type ChatThreadDetail = ChatThread & { messages: UIMessage[] };

const NO_PERSIST = { persist: false } as const;
/** Transcripts leave memory a few minutes after the conversation is closed. */
const THREAD_GC = 5 * 60_000;

export const CHAT_MUT = { deleteThread: ["chat", "delete"] as const };

/**
 * Query defaults (they also cover entries created with setQueryData, e.g. by
 * `useChatTurnFinished`) and the delete default, so a delete queued offline resumes after a reload.
 */
export function registerChatMutations(qc: QueryClient) {
  qc.setQueryDefaults(chatKeys.all(), { meta: NO_PERSIST });
  qc.setQueryDefaults(["chat", "thread"], { meta: NO_PERSIST, gcTime: THREAD_GC });
  qc.setMutationDefaults<{ ok: true }, Error, string, { previous?: ChatThread[] }>(CHAT_MUT.deleteThread, {
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/chat/threads?id=${encodeURIComponent(id)}`),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: chatKeys.threads() });
      const previous = qc.getQueryData<ChatThread[]>(chatKeys.threads());
      qc.setQueryData<ChatThread[]>(chatKeys.threads(), (list) => list?.filter((t) => t.id !== id));
      qc.removeQueries({ queryKey: chatKeys.thread(id) });
      return { previous };
    },
    onError: (_err: Error, _id: string, ctx: { previous?: ChatThread[] } | undefined) => {
      if (ctx?.previous) qc.setQueryData(chatKeys.threads(), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chatKeys.threads() }),
  });
}

export function useChatThreads(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: chatKeys.threads(),
    queryFn: () => api.get<ChatThread[]>("/api/chat/threads"),
    staleTime: 30_000,
    enabled: opts.enabled ?? true,
    meta: NO_PERSIST,
  });
}

/** One thread with its messages. Disabled for `null` (a new, unsaved conversation). */
export function useChatThread(id: string | null) {
  return useQuery({
    queryKey: chatKeys.thread(id ?? "none"),
    queryFn: () => api.get<ChatThreadDetail>(`/api/chat/threads?id=${encodeURIComponent(id!)}`),
    enabled: !!id,
    // The live conversation is in useChat; only refetch when the thread is reopened.
    staleTime: Infinity,
    gcTime: THREAD_GC,
    meta: NO_PERSIST,
  });
}

export function useDeleteChatThread() {
  return useMutation<{ ok: true }, Error, string>({ mutationKey: CHAT_MUT.deleteThread });
}

/**
 * Call when a turn finished: refreshes the thread list (order, title) and writes the live
 * transcript into the cached thread (memory only, see above), so reopening it shortly after
 * shows the latest turn instantly.
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
