"use client";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CommitReport, RollbackReport } from "@/lib/data/import-commit";
import type { DecisionInput, getImportItem, listProposals, reviewStats, ReviewTab } from "@/lib/data/import-review";

export type ImportStatus = Awaited<ReturnType<typeof reviewStats>> & { commits: { commit_id: string; at: string; ops: number; people_created: number; notes_created: number }[] };
export type ProposalPage = Awaited<ReturnType<typeof listProposals>>;
export type Proposal = ProposalPage["items"][number];
export type ImportItemDetail = NonNullable<Awaited<ReturnType<typeof getImportItem>>>;

export const importKeys = {
  all: ["import-review"] as const,
  status: (source: string) => ["import-review", "status", source] as const,
  proposals: (source: string, tab: ReviewTab) => ["import-review", "proposals", source, tab] as const,
  item: (id: string) => ["import-review", "item", id] as const,
};

export function useImportStatus(source = "apple-notes") {
  return useQuery({ queryKey: importKeys.status(source), queryFn: () => api.get<ImportStatus>(`/api/import/status?source=${encodeURIComponent(source)}`) });
}

export function useProposals(tab: ReviewTab, source = "apple-notes") {
  return useInfiniteQuery({
    queryKey: importKeys.proposals(source, tab),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.get<ProposalPage>(`/api/import/proposals?source=${encodeURIComponent(source)}&tab=${tab}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** Lazily loads one note (title, html, text, mentions); pass null to keep it idle. */
export function useImportItem(id: string | null) {
  return useQuery({ queryKey: importKeys.item(id ?? "-"), queryFn: () => api.get<ImportItemDetail>(`/api/import/items/${id}`), enabled: !!id, staleTime: 5 * 60_000 });
}

export function useDecideProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & DecisionInput) => api.patch<{ id: string; status: string; mergedIntoId: string | null }>(`/api/import/proposals/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: importKeys.all }),
  });
}

export function useCommitImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { source?: string; dryRun: boolean; limit?: number }) => api.post<CommitReport>("/api/import/commit", { source: "apple-notes", ...body }),
    onSuccess: (r) => {
      if (r.dryRun) return;
      for (const k of [importKeys.all, ["people"], ["globe"], ["graph"], ["notes"], ["reminders"]]) qc.invalidateQueries({ queryKey: k });
    },
  });
}

export function useRollbackCommit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ commitId, ...body }: { commitId: string; dryRun: boolean; force?: boolean }) => api.post<RollbackReport>(`/api/import/commit/${commitId}/rollback`, body),
    onSuccess: (r) => {
      if (r.dryRun) return;
      for (const k of [importKeys.all, ["people"], ["globe"], ["graph"], ["notes"], ["reminders"]]) qc.invalidateQueries({ queryKey: k });
    },
  });
}
