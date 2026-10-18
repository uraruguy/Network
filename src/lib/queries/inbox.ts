"use client";
import { useMutation, useQuery, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { InboxItem } from "@/lib/db/schema";
import type { StoredExtraction } from "@/lib/data/import";

export type InboxRow = Omit<InboxItem, "proposal"> & { proposal: StoredExtraction | null };
export type InboxAction = { id: string; action: "triage" | "apply" | "dismiss"; primaryIndex?: number };

/** Query keys for the capture inbox (kept here, not in ./keys, so the shell track owns them). */
export const inboxKeys = {
  all: ["inbox"] as const,
};

export const INBOX_MUT = {
  capture: ["inbox", "capture"] as const,
  action: ["inbox", "action"] as const,
};

/** Polling cadence while the inbox is on screen: faster while something still waits for triage. */
const POLL_BUSY_MS = 10_000;
const POLL_IDLE_MS = 60_000;

/**
 * Open inbox items (new + proposed), oldest first. Polls only while a component using it is
 * mounted and the page is visible (TanStack pauses intervals in background tabs).
 */
export function useInbox(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: inboxKeys.all,
    queryFn: () => api.get<InboxRow[]>("/api/inbox/owner"),
    enabled: opts.enabled ?? true,
    refetchInterval: (q) => (q.state.data?.some((i) => i.status === "new") ? POLL_BUSY_MS : POLL_IDLE_MS),
    refetchIntervalInBackground: false,
  });
}

function invalidateAfterApply(qc: QueryClient) {
  for (const key of [["inbox"], ["people"], ["person"], ["reminders"], ["globe"], ["graph"], ["notes"], ["stats"]]) {
    qc.invalidateQueries({ queryKey: key });
  }
}

/**
 * Mutation defaults (registered once in Providers) so a capture typed offline is persisted with
 * the cache and replayed after a reload.
 */
export function registerInboxMutations(qc: QueryClient) {
  qc.setMutationDefaults(INBOX_MUT.capture, {
    mutationFn: (text: string) => api.post<InboxRow>("/api/inbox/owner", { text }),
    // The server saves before it triages: a retry after a triage failure would duplicate the item.
    retry: 0,
    // Offline captures wait (paused, persisted) instead of failing.
    networkMode: "online",
    onSuccess: (row: InboxRow) => {
      qc.setQueryData<InboxRow[]>(inboxKeys.all, (prev) => (prev ? [...prev.filter((i) => i.id !== row.id), row] : prev));
      qc.invalidateQueries({ queryKey: inboxKeys.all });
    },
    onError: () => qc.invalidateQueries({ queryKey: inboxKeys.all }),
  });
  qc.setMutationDefaults(INBOX_MUT.action, {
    mutationFn: ({ id, action, primaryIndex }: InboxAction) => api.post<unknown>(`/api/inbox/owner/${id}`, { action, primaryIndex }),
    onMutate: async ({ id, action }: InboxAction) => {
      if (action !== "dismiss") return;
      await qc.cancelQueries({ queryKey: inboxKeys.all });
      qc.setQueryData<InboxRow[]>(inboxKeys.all, (prev) => prev?.filter((i) => i.id !== id));
    },
    onSettled: (_d: unknown, _e: unknown, v: InboxAction) => {
      if (v.action === "apply") invalidateAfterApply(qc);
      else qc.invalidateQueries({ queryKey: inboxKeys.all });
    },
  });
}

/** Quick capture: saves the text and asks the AI who it is about (server triages in one go). */
export function useCapture() {
  return useMutation<InboxRow, Error, string>({ mutationKey: INBOX_MUT.capture });
}

export function useInboxAction() {
  return useMutation<unknown, Error, InboxAction>({ mutationKey: INBOX_MUT.action });
}
