"use client";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PersonInput, PersonPatch } from "@/lib/schemas";
import { keys } from "./keys";
import type { Category, PersonDetail, PersonListItem } from "./types";

export type PeopleFilters = { q?: string; category?: string; warmth?: string; country?: string };

function qs(filters: PeopleFilters) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function usePeople(filters: PeopleFilters = {}) {
  return useQuery({
    queryKey: keys.people(filters),
    queryFn: () => api.get<PersonListItem[]>(`/api/people${qs(filters)}`),
  });
}

export function usePerson(id: string | null) {
  return useQuery({
    queryKey: keys.person(id ?? ""),
    queryFn: () => api.get<PersonDetail>(`/api/people/${id}`),
    enabled: !!id,
  });
}

export function useCategories() {
  return useQuery({ queryKey: keys.categories(), queryFn: () => api.get<Category[]>("/api/categories"), staleTime: 5 * 60_000 });
}

/* ---------- mutations (defaults registered once so paused/offline mutations can resume after reload) ---------- */

export const MUT = {
  createPerson: ["people", "create"] as const,
  updatePerson: ["people", "update"] as const,
  deletePerson: ["people", "delete"] as const,
};

export function registerPeopleMutations(qc: QueryClient) {
  qc.setMutationDefaults(MUT.createPerson, {
    mutationFn: (input: PersonInput) => api.post<PersonDetail>("/api/people", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["people"] }).then(() => qc.invalidateQueries({ queryKey: keys.globe() })),
  });
  qc.setMutationDefaults(MUT.updatePerson, {
    mutationFn: ({ id, patch }: { id: string; patch: PersonPatch }) => api.patch<PersonDetail>(`/api/people/${id}`, patch),
    onSuccess: (data: PersonDetail) => {
      qc.setQueryData(keys.person(data.id), data);
      qc.invalidateQueries({ queryKey: ["people"] });
      qc.invalidateQueries({ queryKey: keys.globe() });
    },
  });
  qc.setMutationDefaults(MUT.deletePerson, {
    mutationFn: (id: string) => api.delete(`/api/people/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["people"] });
      qc.invalidateQueries({ queryKey: keys.globe() });
    },
  });
}

export function useCreatePerson() {
  return useMutation<PersonDetail, Error, PersonInput>({ mutationKey: MUT.createPerson });
}

export function useUpdatePerson(id: string) {
  const qc = useQueryClient();
  return useMutation<PersonDetail, Error, PersonPatch, { previous?: PersonDetail }>({
    mutationKey: MUT.updatePerson,
    mutationFn: (patch) => api.patch<PersonDetail>(`/api/people/${id}`, patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: keys.person(id) });
      const previous = qc.getQueryData<PersonDetail>(keys.person(id));
      if (previous) {
        const { homeLocation: _h, metLocation: _m, categoryIds: _c, nextFollowupAt, ...cols } = patch;
        qc.setQueryData<PersonDetail>(keys.person(id), {
          ...previous,
          ...cols,
          ...(nextFollowupAt !== undefined ? { nextFollowupAt: nextFollowupAt ? new Date(nextFollowupAt) : null } : {}),
        } as PersonDetail);
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(keys.person(id), ctx.previous);
    },
    onSuccess: (data) => {
      qc.setQueryData(keys.person(id), data);
      qc.invalidateQueries({ queryKey: ["people"] });
      qc.invalidateQueries({ queryKey: keys.globe() });
    },
  });
}

export function useDeletePerson() {
  return useMutation<unknown, Error, string>({ mutationKey: MUT.deletePerson });
}
