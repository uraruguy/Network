"use client";
import { useMutation, useQuery, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ActivityInput, ActivityPatch, TagPatch } from "@/lib/schemas";
import { keys } from "./keys";
import type { ActivityRow, TagRow, Taxonomy } from "./types";

/* ---------- reads ---------- */

export function useActivities() {
  return useQuery({ queryKey: keys.activities(), queryFn: () => api.get<ActivityRow[]>("/api/activities"), staleTime: 5 * 60_000 });
}

export function useTags() {
  return useQuery({ queryKey: keys.tags(), queryFn: () => api.get<TagRow[]>("/api/tags"), staleTime: 5 * 60_000 });
}

/** Categories, activities and tags with counts in one request. */
export function useTaxonomy() {
  return useQuery({ queryKey: keys.taxonomy(), queryFn: () => api.get<Taxonomy>("/api/taxonomy"), staleTime: 60_000 });
}

/* ---------- mutations ---------- */

export const TAXONOMY_MUT = {
  createActivity: ["activities", "create"] as const,
  updateActivity: ["activities", "update"] as const,
  deleteActivity: ["activities", "delete"] as const,
  reorderActivities: ["activities", "reorder"] as const,
  updateTag: ["tags", "update"] as const,
  deleteTag: ["tags", "delete"] as const,
  mergeTags: ["tags", "merge"] as const,
};

const ACTIVITY_CREATE_SCOPE = "activities:create";

function invalidateTaxonomy(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: keys.activities() });
  qc.invalidateQueries({ queryKey: keys.tags() });
  qc.invalidateQueries({ queryKey: keys.taxonomy() });
  // Links changed (delete/merge): person rows and details carry ids.
  qc.invalidateQueries({ queryKey: ["people"] });
  qc.invalidateQueries({ queryKey: ["person"] });
}

export function registerTaxonomyMutations(qc: QueryClient) {
  qc.setMutationDefaults(TAXONOMY_MUT.createActivity, {
    mutationFn: (input: ActivityInput) => api.post<ActivityRow>("/api/activities", input),
    onSuccess: () => invalidateTaxonomy(qc),
  });
  qc.setMutationDefaults(TAXONOMY_MUT.updateActivity, {
    mutationFn: ({ id, patch }: { id: string; patch: ActivityPatch }) => api.patch<ActivityRow>(`/api/activities/${id}`, patch),
    onSuccess: () => invalidateTaxonomy(qc),
  });
  qc.setMutationDefaults(TAXONOMY_MUT.deleteActivity, {
    mutationFn: (id: string) => api.delete(`/api/activities/${id}`),
    onSuccess: () => invalidateTaxonomy(qc),
  });
  qc.setMutationDefaults(TAXONOMY_MUT.reorderActivities, {
    mutationFn: (ids: string[]) => api.post<ActivityRow[]>("/api/activities/reorder", { ids }),
    onSuccess: (rows: ActivityRow[]) => {
      qc.setQueryData(keys.activities(), rows);
      qc.invalidateQueries({ queryKey: keys.taxonomy() });
    },
  });
  qc.setMutationDefaults(TAXONOMY_MUT.updateTag, {
    mutationFn: ({ id, patch }: { id: string; patch: TagPatch }) => api.patch<TagRow>(`/api/tags/${id}`, patch),
    onSuccess: () => invalidateTaxonomy(qc),
  });
  qc.setMutationDefaults(TAXONOMY_MUT.deleteTag, {
    mutationFn: (id: string) => api.delete(`/api/tags/${id}`),
    onSuccess: () => invalidateTaxonomy(qc),
  });
  qc.setMutationDefaults(TAXONOMY_MUT.mergeTags, {
    mutationFn: ({ id, intoId }: { id: string; intoId: string }) => api.post<TagRow>(`/api/tags/${id}/merge`, { intoId }),
    onSuccess: () => invalidateTaxonomy(qc),
  });
}

/**
 * Creates an activity; a client id is attached at call time so offline replays are idempotent.
 * Creates queue in one scope that a person write referencing a new activity joins (see
 * ./write-order), so the activity exists before the person is linked to it.
 */
export function useCreateActivity() {
  const m = useMutation<ActivityRow, Error, ActivityInput>({ mutationKey: TAXONOMY_MUT.createActivity, scope: { id: ACTIVITY_CREATE_SCOPE } });
  return { ...m, mutate: (input: ActivityInput, opts?: Parameters<typeof m.mutate>[1]) => m.mutate({ ...input, id: input.id ?? crypto.randomUUID() }, opts) };
}
export const useUpdateActivity = () => useMutation<ActivityRow, Error, { id: string; patch: ActivityPatch }>({ mutationKey: TAXONOMY_MUT.updateActivity });
export const useDeleteActivity = () => useMutation<unknown, Error, string>({ mutationKey: TAXONOMY_MUT.deleteActivity });
export const useReorderActivities = () => useMutation<ActivityRow[], Error, string[]>({ mutationKey: TAXONOMY_MUT.reorderActivities });
export const useUpdateTag = () => useMutation<TagRow, Error, { id: string; patch: TagPatch }>({ mutationKey: TAXONOMY_MUT.updateTag });
export const useDeleteTag = () => useMutation<unknown, Error, string>({ mutationKey: TAXONOMY_MUT.deleteTag });
export const useMergeTags = () => useMutation<TagRow, Error, { id: string; intoId: string }>({ mutationKey: TAXONOMY_MUT.mergeTags });
