"use client";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { BatchSummary } from "@/lib/data/import-batch";
import type { CommitReport, RollbackReport } from "@/lib/data/import-commit";
import type { DecisionInput, getImportItem, listProposals, MergeTarget, proposalEvidence, reviewStats, ReviewTab } from "@/lib/data/import-review";

export type ImportStatus = Awaited<ReturnType<typeof reviewStats>> & { commits: { commit_id: string; at: string; ops: number; people_created: number; notes_created: number }[] };
export type ProposalPage = Awaited<ReturnType<typeof listProposals>>;
export type Proposal = ProposalPage["items"][number];
export type ImportItemDetail = NonNullable<Awaited<ReturnType<typeof getImportItem>>>;
export type ProposalDetail = NonNullable<Awaited<ReturnType<typeof proposalEvidence>>>;
export type Evidence = Proposal["evidence"][number] & { gone?: boolean };
export type { BatchSummary, MergeTarget, ReviewTab };
/** Commit route response: counts without per-person results; a dry run adds `keys` in commit order. */
export type CommitResult = Omit<CommitReport, "people"> & { people: Omit<CommitReport["people"], "results">; keys?: string[] };
export type IngestResult = { write: boolean; jobId: string | null; notes: number; duplicates: number; counts: Record<string, number>; staleProposals: number };

export const importKeys = {
  all: ["import-review"] as const,
  status: (source: string) => ["import-review", "status", source] as const,
  proposals: (source: string, tab: ReviewTab) => ["import-review", "proposals", source, tab] as const,
  queue: (source: string) => ["import-review", "queue", source] as const,
  item: (id: string) => ["import-review", "item", id] as const,
  detail: (id: string) => ["import-review", "detail", id] as const,
  batch: (source: string) => ["import-review", "batch", source] as const,
};

const qs = (source: string) => `source=${encodeURIComponent(source)}`;

/** Slim counts (items by status, proposals by status, recent commits). */
export function useImportStatus(source = "apple-notes") {
  return useQuery({ queryKey: importKeys.status(source), queryFn: () => api.get<ImportStatus>(`/api/import/status?${qs(source)}`) });
}

/** Paged list for the Approved / Passers-by tabs. */
export function useProposals(tab: ReviewTab, source = "apple-notes", opts: { enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: importKeys.proposals(source, tab),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.get<ProposalPage>(`/api/import/proposals?${qs(source)}&tab=${tab}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
    getNextPageParam: (last) => last.nextCursor,
    enabled: opts.enabled ?? true,
  });
}

/**
 * The next undecided proposals (always the first page: decided ones drop out of the server list,
 * so offset paging would skip people). The review screen keeps its own session snapshot.
 */
export function useReviewQueue(source = "apple-notes") {
  return useQuery({
    queryKey: importKeys.queue(source),
    queryFn: () => api.get<ProposalPage>(`/api/import/proposals?${qs(source)}&tab=review`),
    // The cache is persisted offline; a review session must start from the server's current list.
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
}

/** Lazily loads one note (title, html, text, mentions); pass null to keep it idle. */
export function useImportItem(id: string | null) {
  return useQuery({ queryKey: importKeys.item(id ?? "-"), queryFn: () => api.get<ImportItemDetail>(`/api/import/items/${id}`), enabled: !!id, staleTime: 5 * 60_000 });
}

/** Every mention of a proposal (pass null to keep it idle). */
export function useProposalDetail(id: string | null, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: importKeys.detail(id ?? "-"),
    queryFn: () => api.get<ProposalDetail>(`/api/import/proposals/${id}`),
    enabled: !!id && (opts.enabled ?? true),
    staleTime: 60_000,
  });
}

/** Merge-target search (existing people first, then proposals); for the merge combobox. */
export async function searchMergeTargets(source: string, q: string, exclude?: string) {
  const r = await api.get<{ items: MergeTarget[] }>(`/api/import/targets?${qs(source)}&q=${encodeURIComponent(q)}${exclude ? `&exclude=${exclude}` : ""}`);
  return r.items;
}

/** Marks lists stale after a decision; the review queue refreshes itself when it runs low. */
function afterDecision(qc: QueryClient, source: string, ids: string[]) {
  qc.invalidateQueries({ queryKey: importKeys.status(source) });
  qc.invalidateQueries({ queryKey: importKeys.batch(source) });
  for (const tab of ["approved", "rejected", "committed", "merged", "all"] as const) qc.invalidateQueries({ queryKey: importKeys.proposals(source, tab) });
  for (const id of ids) qc.invalidateQueries({ queryKey: importKeys.detail(id) });
}

export type DecideVars = { id: string } & DecisionInput;
export type DecideResult = { id: string; key: string; status: string; disposition: string; needsReview: boolean; mergedIntoId: string | null; decidedBy: string | null };

export function useDecideProposal(source = "apple-notes") {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: ({ id, ...input }: DecideVars) => api.patch<DecideResult>(`/api/import/proposals/${id}`, input),
    onSettled: (_r, _e, v) => afterDecision(qc, source, [v.id, ...(v.action === "merge" ? [v.intoId] : [])]),
  });
}

export function useBatchSummary(source = "apple-notes", opts: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: importKeys.batch(source), queryFn: () => api.get<BatchSummary>(`/api/import/batch?${qs(source)}`), enabled: opts.enabled ?? true });
}

export type BatchAction = { action: "restore-gone" } | { action: "dismiss-no-people" } | { action: "folder-tags"; changes: { folder: string; on: boolean }[] };

export function useBatchAction(source = "apple-notes") {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (body: BatchAction) => api.post<{ restored?: number; dismissed?: number; updated?: number }>("/api/import/batch", { source, ...body }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: importKeys.batch(source) });
      qc.invalidateQueries({ queryKey: importKeys.status(source) });
      qc.invalidateQueries({ queryKey: ["import-review", "proposals", source] });
      qc.invalidateQueries({ queryKey: importKeys.queue(source) });
    },
  });
}

const NETWORK_KEYS = [["people"], ["person"], ["globe"], ["graph"], ["notes"], ["reminders"], ["stats"], ["tags"], ["activities"], ["taxonomy"]];

export function invalidateNetwork(qc: QueryClient) {
  for (const k of NETWORK_KEYS) qc.invalidateQueries({ queryKey: k });
}

export function useCommitImport(source = "apple-notes") {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (body: { dryRun: boolean; limit?: number; keys?: string[]; commitId?: string }) => api.post<CommitResult>("/api/import/commit", { source, ...body }),
    onSuccess: (r) => {
      if (r.dryRun) return;
      qc.invalidateQueries({ queryKey: importKeys.all });
      invalidateNetwork(qc);
    },
  });
}

export function useRollbackCommit() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: ({ commitId, ...body }: { commitId: string; dryRun: boolean; force?: boolean }) => api.post<RollbackReport>(`/api/import/commit/${commitId}/rollback`, body),
    onSuccess: (r) => {
      if (r.dryRun) return;
      qc.invalidateQueries({ queryKey: importKeys.all });
      invalidateNetwork(qc);
    },
  });
}

/** Upload of an Apple Notes export (dry run first, then write). */
export function useIngestExport(source = "apple-notes") {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (body: { rows: unknown[]; write: boolean }) => api.post<IngestResult>("/api/import/ingest", { source, ...body }),
    onSuccess: (r) => {
      if (r.write) qc.invalidateQueries({ queryKey: importKeys.all });
    },
  });
}
