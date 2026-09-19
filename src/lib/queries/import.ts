"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Decision, ExportRow, getJob, listJobs } from "@/lib/data/import";

export type ImportJobSummary = Awaited<ReturnType<typeof listJobs>>[number];
export type ImportJobDetail = NonNullable<Awaited<ReturnType<typeof getJob>>>;
export type ImportItemRow = ImportJobDetail["items"][number];

export function useImportJobs() {
  return useQuery({ queryKey: ["import", "jobs"], queryFn: () => api.get<{ jobs: ImportJobSummary[]; aiConfigured: boolean }>("/api/import") });
}

export function useImportJob(jobId: string | null, refetchInterval?: number | false) {
  return useQuery({ queryKey: ["import", "job", jobId], queryFn: () => api.get<ImportJobDetail>(`/api/import/${jobId}`), enabled: !!jobId, refetchInterval });
}

export function useCreateImportJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: ExportRow[]) => api.post<{ id: string; totalItems: number }>("/api/import", { rows }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["import"] }),
  });
}

export function useItemAction(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, ...body }: { itemId: string } & ({ action: "commit"; decision: Decision } | { action: "skip" } | { action: "reopen" })) =>
      api.post<unknown>(`/api/import/items/${itemId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["import", "job", jobId] });
      qc.invalidateQueries({ queryKey: ["people"] });
      qc.invalidateQueries({ queryKey: ["globe"] });
      qc.invalidateQueries({ queryKey: ["graph"] });
    },
  });
}
