"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { InboxItem } from "@/lib/db/schema";
import type { StoredExtraction } from "@/lib/data/import";

export type InboxRow = Omit<InboxItem, "proposal"> & { proposal: StoredExtraction | null };

export function useInbox() {
  return useQuery({ queryKey: ["inbox"], queryFn: () => api.get<InboxRow[]>("/api/inbox/owner"), refetchInterval: 60_000 });
}

export function useCapture() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (text: string) => api.post<InboxRow>("/api/inbox/owner", { text }), onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox"] }) });
}

export function useInboxAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, primaryIndex }: { id: string; action: "triage" | "apply" | "dismiss"; primaryIndex?: number }) => api.post<unknown>(`/api/inbox/owner/${id}`, { action, primaryIndex }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: ["people"] });
      qc.invalidateQueries({ queryKey: ["reminders"] });
      qc.invalidateQueries({ queryKey: ["globe"] });
      qc.invalidateQueries({ queryKey: ["graph"] });
      qc.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}
