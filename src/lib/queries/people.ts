"use client";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "@/lib/api";
import type { PersonInput, PersonPatch } from "@/lib/schemas";
import { fold } from "@/lib/text";
import { matchesText, toLegacyDetail, toPersonListItem } from "./compat";
import { keys } from "./keys";
import { registerReminderMutations } from "./reminders";
import { registerTaxonomyMutations, useActivities } from "./taxonomy";
import type { Category, NotesPage, PeopleSearchPage, PersonDetailApi, PersonIndexRow } from "./types";

export type PeopleFilters = { q?: string; category?: string; warmth?: string; country?: string };

/* ---------- reads ---------- */

/** Every person as a compact row (cached whole, persisted offline). */
export function usePeopleIndex() {
  return useQuery({ queryKey: keys.peopleIndex(), queryFn: () => api.get<PersonIndexRow[]>("/api/people") });
}

export function useCategories() {
  return useQuery({ queryKey: keys.categories(), queryFn: () => api.get<Category[]>("/api/categories"), staleTime: 5 * 60_000 });
}

/**
 * v1-compatible people list, filtered locally from the cached index (instant, works offline).
 * Rows carry `categories` objects and legacy `hobbies` for the current screens.
 */
export function usePeople(filters: PeopleFilters = {}) {
  const index = usePeopleIndex();
  const { data: cats } = useCategories();
  const { data: acts } = useActivities();
  const { q, category, warmth, country } = filters;
  const data = useMemo(() => {
    if (!index.data) return undefined;
    const needle = q ? fold(q.trim()) : "";
    return index.data
      .filter(
        (p) =>
          matchesText(p, needle, fold) &&
          (!category || p.categoryIds.includes(category)) &&
          (!warmth || p.warmth === warmth) &&
          (!country || p.homeLocation?.countryCode?.toUpperCase() === country.toUpperCase()),
      )
      .map((p) => toPersonListItem(p, cats ?? [], acts ?? []));
  }, [index.data, cats, acts, q, category, warmth, country]);
  return { ...index, data };
}

/** Server-side people search (ranked full-text + filters), paginated. For AI-ish / large queries. */
export function usePeopleSearch(params: Record<string, string | string[] | undefined>, opts: { enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: keys.peopleSearch(params),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
        else if (v) qs.set(k, v);
      }
      if (pageParam) qs.set("cursor", pageParam);
      return api.get<PeopleSearchPage>(`/api/people/search?${qs}`);
    },
    getNextPageParam: (last) => last.nextCursor,
    enabled: opts.enabled ?? true,
  });
}

/** Raw v2 person detail. */
export function usePersonDetail(id: string | null) {
  return useQuery({ queryKey: keys.person(id ?? ""), queryFn: () => api.get<PersonDetailApi>(`/api/people/${id}`), enabled: !!id });
}

/** v1-compatible person detail (adds `hobbies`, note `contentText`). */
export function usePerson(id: string | null) {
  const q = usePersonDetail(id);
  const { data: acts } = useActivities();
  const data = useMemo(() => (q.data ? toLegacyDetail(q.data, acts ?? []) : undefined), [q.data, acts]);
  return { ...q, data };
}

/** A person's notes, newest first, page by page (excerpts unless `full`). */
export function usePersonNotes(personId: string | null, opts: { full?: boolean; pageSize?: number } = {}) {
  return useInfiniteQuery({
    queryKey: [...keys.personNotes(personId ?? ""), opts.full ? "full" : "summary"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams({ limit: String(opts.pageSize ?? 30) });
      if (opts.full) qs.set("full", "1");
      if (pageParam) qs.set("before", pageParam);
      return api.get<NotesPage>(`/api/people/${personId}/notes?${qs}`);
    },
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!personId,
  });
}

/* ---------- mutations (defaults registered once so paused/offline mutations can resume after reload) ---------- */

export const MUT = {
  createPerson: ["people", "create"] as const,
  updatePerson: ["people", "update"] as const,
  deletePerson: ["people", "delete"] as const,
  restorePerson: ["people", "restore"] as const,
};

function invalidatePeople(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["people"] });
  qc.invalidateQueries({ queryKey: keys.globe() });
  qc.invalidateQueries({ queryKey: keys.graph() });
  qc.invalidateQueries({ queryKey: keys.stats() });
  qc.invalidateQueries({ queryKey: keys.taxonomy() });
  qc.invalidateQueries({ queryKey: keys.tags() });
  qc.invalidateQueries({ queryKey: keys.activities() });
}

/**
 * Registers mutation defaults for people — and, until the providers call each registrar, also
 * for activities/tags and reminders (safe to call more than once).
 */
export function registerPeopleMutations(qc: QueryClient) {
  qc.setMutationDefaults(MUT.createPerson, {
    mutationFn: (input: PersonInput) => api.post<PersonDetailApi>("/api/people", input),
    onSuccess: (data: PersonDetailApi) => {
      qc.setQueryData(keys.person(data.id), data);
      invalidatePeople(qc);
    },
  });
  qc.setMutationDefaults(MUT.updatePerson, {
    mutationFn: ({ id, patch }: { id: string; patch: PersonPatch }) => api.patch<PersonDetailApi>(`/api/people/${id}`, patch),
    onSuccess: (data: PersonDetailApi) => {
      qc.setQueryData(keys.person(data.id), data);
      invalidatePeople(qc);
    },
  });
  qc.setMutationDefaults(MUT.deletePerson, {
    mutationFn: (id: string) => api.delete(`/api/people/${id}`),
    onSuccess: () => invalidatePeople(qc),
  });
  qc.setMutationDefaults(MUT.restorePerson, {
    mutationFn: (id: string) => api.post<PersonDetailApi>(`/api/people/${id}/restore`),
    onSuccess: (data: PersonDetailApi) => {
      qc.setQueryData(keys.person(data.id), data);
      invalidatePeople(qc);
    },
  });
  registerTaxonomyMutations(qc);
  registerReminderMutations(qc);
}

/**
 * Creates a person. A client-generated id is attached at call time, so retries and offline replays
 * after a reload hit the same id (the server treats repeats as idempotent).
 */
export function useCreatePerson() {
  const m = useMutation<PersonDetailApi, Error, PersonInput>({ mutationKey: MUT.createPerson });
  return { ...m, mutate: (input: PersonInput, opts?: Parameters<typeof m.mutate>[1]) => m.mutate({ ...input, id: input.id ?? crypto.randomUUID() }, opts) };
}

export function useUpdatePerson(id: string) {
  const qc = useQueryClient();
  return useMutation<PersonDetailApi, Error, PersonPatch, { previous?: PersonDetailApi }>({
    mutationKey: MUT.updatePerson,
    mutationFn: (patch) => api.patch<PersonDetailApi>(`/api/people/${id}`, patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: keys.person(id) });
      const previous = qc.getQueryData<PersonDetailApi>(keys.person(id));
      if (previous) {
        const {
          homeLocation: _home,
          metLocation: _met,
          categoryIds,
          activityIds,
          tagNames: _tags,
          hobbies: _hobbies,
          hobbiesOther: _hobbiesOther,
          nextFollowupAt,
          ...cols
        } = patch;
        qc.setQueryData<PersonDetailApi>(keys.person(id), {
          ...previous,
          ...cols,
          ...(categoryIds ? { categoryIds } : {}),
          ...(activityIds ? { activityIds } : {}),
          ...(nextFollowupAt !== undefined ? { nextFollowupAt: nextFollowupAt ? new Date(nextFollowupAt) : null } : {}),
        } as PersonDetailApi);
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(keys.person(id), ctx.previous);
    },
    onSuccess: (data) => {
      qc.setQueryData(keys.person(id), data);
      invalidatePeople(qc);
    },
  });
}

export function useDeletePerson() {
  return useMutation<unknown, Error, string>({ mutationKey: MUT.deletePerson });
}

export function useRestorePerson() {
  return useMutation<PersonDetailApi, Error, string>({ mutationKey: MUT.restorePerson });
}
