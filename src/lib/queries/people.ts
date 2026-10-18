"use client";
import { onlineManager, useInfiniteQuery, useIsMutating, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "@/components/ui/Toast";
import { api, ApiError } from "@/lib/api";
import type { MergeReport } from "@/lib/data/people-merge";
import type { NoteDoc } from "@/lib/notes/cache";
import type { PersonInput, PersonPatch } from "@/lib/schemas";
import { fold } from "@/lib/text";
import { matchesText, toLegacyDetail, toPersonListItem } from "./compat";
import { chatKeys } from "./chat";
import { keys } from "./keys";
import { applyPersonPatch, indexRowFromDetail, seedPersonDetail, upsertIndexRow, type Lookups } from "./people-cache";
import { registerReminderMutations } from "./reminders";
import { registerTaxonomyMutations, useActivities } from "./taxonomy";
import type { ActivityRow, Category, NotesPage, PeopleSearchPage, PersonDetailApi, PersonIndexRow, RecentNoteApi, TagRow } from "./types";
import { activityEntity, personEntity, scopeFor } from "./write-order";

export type { MergeReport };

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
    gcTime: 60_000,
    meta: { persist: false },
  });
}

/** Raw v2 person detail. */
export function usePersonDetail(id: string | null) {
  return useQuery({ queryKey: keys.person(id ?? ""), queryFn: () => api.get<PersonDetailApi>(`/api/people/${id}`), enabled: !!id });
}

/**
 * The profile screen's read: the full detail, plus the cached index row as an instant preview
 * (name, role, city, avatar) while the detail loads. A person created on this device whose create
 * is still queued (offline) isn't fetched — the seeded detail is the truth until it syncs.
 */
export function usePersonProfile(id: string) {
  const creating = useIsMutating({ mutationKey: MUT.createPerson, predicate: (m) => (m.state.variables as { id?: string } | undefined)?.id === id });
  const detail = useQuery({
    queryKey: keys.person(id),
    queryFn: () => api.get<PersonDetailApi>(`/api/people/${id}`),
    enabled: !!id && creating === 0,
    retry: (count, e) => !(e instanceof ApiError && e.status === 404) && count < 1,
  });
  const { data: index } = usePeopleIndex();
  const preview = useMemo(() => index?.find((p) => p.id === id), [index, id]);
  const notFound = !detail.data && detail.error instanceof ApiError && detail.error.status === 404;
  return { ...detail, person: detail.data, preview, notFound, creating: creating > 0 };
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

/**
 * What merging `id` into `into` would move (a server-side dry run, nothing saved). Live only:
 * never persisted, refetched each time the pair is shown.
 */
export function useMergePreview(id: string, into: string | null) {
  return useQuery({
    queryKey: keys.mergePreview(id, into ?? ""),
    queryFn: () => api.get<MergeReport>(`/api/people/${id}/merge?into=${into}`),
    enabled: !!into && into !== id,
    staleTime: 0,
    gcTime: 60_000,
    retry: false,
    meta: { persist: false },
  });
}

/* ---------- optimistic cache plumbing ---------- */

/** Everything cached that optimistic person writes resolve relations from. */
export function cachedLookups(qc: QueryClient): Lookups {
  return {
    categories: qc.getQueryData<Category[]>(keys.categories()),
    activities: qc.getQueryData<ActivityRow[]>(keys.activities()),
    tags: qc.getQueryData<TagRow[]>(keys.tags()),
    people: qc.getQueryData<PersonIndexRow[]>(keys.peopleIndex()),
  };
}

/** Writes a detail into the cache and mirrors it into the people index. */
function putPerson(qc: QueryClient, detail: PersonDetailApi) {
  qc.setQueryData(keys.person(detail.id), detail);
  qc.setQueryData<PersonIndexRow[]>(keys.peopleIndex(), (rows) => (rows ? upsertIndexRow(rows, indexRowFromDetail(detail)) : rows));
}

function removeFromIndex(qc: QueryClient, id: string) {
  qc.setQueryData<PersonIndexRow[]>(keys.peopleIndex(), (rows) => rows?.filter((r) => r.id !== id));
}

/** A removed person's follow-ups and notes leave Today (and every other list) at once. */
function removePersonRows(qc: QueryClient, id: string) {
  for (const [key, list] of qc.getQueriesData<{ personId: string }[]>({ queryKey: ["reminders"] })) {
    if (list?.some((r) => r.personId === id)) qc.setQueryData(key, list.filter((r) => r.personId !== id));
  }
  qc.setQueryData<RecentNoteApi[]>(keys.recentNotes(), (list) => list?.filter((n) => n.personId !== id));
}

/** Lists that hold a person's follow-ups and notes (Today): refreshed after a removal or restore. */
function invalidatePersonRows(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["reminders"] });
  qc.invalidateQueries({ queryKey: ["notes"] });
  qc.invalidateQueries({ queryKey: keys.stats() });
}

/** Server truth for everything a person write touches — skipped while other person writes are in flight. */
function invalidatePeople(qc: QueryClient, id?: string) {
  if (qc.isMutating({ mutationKey: ["people"] }) > 1) return;
  qc.invalidateQueries({ queryKey: ["people"] });
  if (id) qc.invalidateQueries({ queryKey: keys.person(id) });
  qc.invalidateQueries({ queryKey: keys.globe() });
  qc.invalidateQueries({ queryKey: keys.graph() });
  qc.invalidateQueries({ queryKey: keys.stats() });
  qc.invalidateQueries({ queryKey: keys.taxonomy() });
  qc.invalidateQueries({ queryKey: keys.tags() });
  qc.invalidateQueries({ queryKey: keys.activities() });
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : undefined);

/**
 * Removes cached queries now — or, while a screen still shows them, once it lets go: the page of
 * a card being merged away keeps its data until it navigates, instead of refetching a 404.
 */
function removeWhenUnobserved(qc: QueryClient, queryKey: readonly unknown[], exact = false) {
  const cache = qc.getQueryCache();
  for (const query of cache.findAll({ queryKey, exact })) {
    if (!query.getObserversCount()) {
      cache.remove(query);
      continue;
    }
    const unsubscribe = cache.subscribe((e) => {
      if (e.query !== query || e.type !== "observerRemoved" || query.getObserversCount()) return;
      unsubscribe();
      cache.remove(query);
    });
  }
}

/**
 * After a merge, everything cached about the duplicate belongs to the kept person: its profile
 * and note list leave the cache, and open note documents (possibly with unsynced edits) are
 * re-pointed so a later save can't move a note back onto the removed card.
 */
function forgetMergedPerson(qc: QueryClient, dropId: string, keepId: string) {
  removeFromIndex(qc, dropId);
  removeWhenUnobserved(qc, keys.person(dropId), true);
  removeWhenUnobserved(qc, keys.personNotes(dropId));
  for (const [key, doc] of qc.getQueriesData<NoteDoc>({ queryKey: ["note"] })) {
    if (doc?.personId === dropId) qc.setQueryData(key, { ...doc, personId: keepId });
  }
}

/* ---------- mutations (defaults registered once so paused/offline mutations can resume after reload) ---------- */

export const MUT = {
  createPerson: ["people", "create"] as const,
  updatePerson: ["people", "update"] as const,
  deletePerson: ["people", "delete"] as const,
  restorePerson: ["people", "restore"] as const,
  mergePeople: ["people", "merge"] as const,
};

export type CreatePersonVars = PersonInput & { id: string };
export type UpdatePersonVars = { id: string; patch: PersonPatch };
/** Merge person `id` (the duplicate, removed) into `into` (kept). */
export type MergePeopleVars = { id: string; into: string };
export type MergePeopleResult = { person: PersonDetailApi; report: MergeReport };

/** A merge never queues: it rewrites two people at once, so it runs now or fails loudly. */
export class OfflineMergeError extends Error {
  constructor() {
    super("You’re offline. Merging needs a connection.");
    this.name = "OfflineMergeError";
  }
}

/**
 * Registers mutation defaults for people — and, until the providers call each registrar, also
 * for activities/tags and reminders (safe to call more than once). Optimistic cache changes run in
 * `onMutate`, so they happen once (a persisted mutation resuming after a reload skips it).
 */
export function registerPeopleMutations(qc: QueryClient) {
  qc.setMutationDefaults<PersonDetailApi, Error, CreatePersonVars>(MUT.createPerson, {
    mutationFn: (input: CreatePersonVars) => api.post<PersonDetailApi>("/api/people", input),
    onMutate: async (input: CreatePersonVars) => {
      if (!qc.getQueryData(keys.person(input.id))) putPerson(qc, seedPersonDetail(input, cachedLookups(qc)));
    },
    onSuccess: (data: PersonDetailApi) => putPerson(qc, data),
    onError: (e: unknown, input: CreatePersonVars) => {
      removeFromIndex(qc, input.id);
      qc.removeQueries({ queryKey: keys.person(input.id), exact: true });
      toast.error(`Couldn’t add ${input.displayName}`, {
        description: errorText(e),
        duration: 10_000,
        action: { label: "Retry", onClick: () => void runPerson(qc, MUT.createPerson, input, input.id).catch(() => {}) },
      });
    },
    onSettled: (_d: unknown, _e: unknown, input: CreatePersonVars) => invalidatePeople(qc, input.id),
  });
  qc.setMutationDefaults<PersonDetailApi, Error, UpdatePersonVars>(MUT.updatePerson, {
    mutationFn: ({ id, patch }: UpdatePersonVars) => api.patch<PersonDetailApi>(`/api/people/${id}`, patch),
    onMutate: async ({ id, patch }: UpdatePersonVars) => {
      await qc.cancelQueries({ queryKey: keys.person(id) });
      const current = qc.getQueryData<PersonDetailApi>(keys.person(id));
      if (current) putPerson(qc, applyPersonPatch(current, patch, cachedLookups(qc)));
    },
    onSuccess: (data: PersonDetailApi) => putPerson(qc, data),
    onError: (e: unknown, { id }: UpdatePersonVars) => {
      toast.error("Couldn’t save changes", { description: errorText(e) });
      qc.invalidateQueries({ queryKey: keys.person(id) });
      qc.invalidateQueries({ queryKey: keys.peopleIndex() });
    },
    onSettled: (_d: unknown, _e: unknown, { id }: UpdatePersonVars) => invalidatePeople(qc, id),
  });
  qc.setMutationDefaults<unknown, Error, string>(MUT.deletePerson, {
    mutationFn: (id: string) => api.delete(`/api/people/${id}`),
    onMutate: async (id: string) => {
      removeFromIndex(qc, id);
      removePersonRows(qc, id);
    },
    onError: (e: unknown) => {
      toast.error("Couldn’t remove this person", { description: errorText(e) });
      qc.invalidateQueries({ queryKey: keys.peopleIndex() });
    },
    onSettled: (_d: unknown, _e: unknown, id: string) => {
      invalidatePersonRows(qc);
      invalidatePeople(qc, id);
    },
  });
  qc.setMutationDefaults<PersonDetailApi, Error, string>(MUT.restorePerson, {
    mutationFn: (id: string) => api.post<PersonDetailApi>(`/api/people/${id}/restore`),
    onMutate: async (id: string) => {
      const cached = qc.getQueryData<PersonDetailApi>(keys.person(id));
      if (cached) putPerson(qc, cached);
    },
    onSuccess: (data: PersonDetailApi) => putPerson(qc, data),
    onError: (e: unknown) => toast.error("Couldn’t restore", { description: errorText(e) }),
    onSettled: (_d: unknown, _e: unknown, id: string) => {
      invalidatePersonRows(qc);
      invalidatePeople(qc, id);
    },
  });
  qc.setMutationDefaults<MergePeopleResult, Error, MergePeopleVars>(MUT.mergePeople, {
    mutationFn: ({ id, into }: MergePeopleVars) => {
      if (!onlineManager.isOnline()) throw new OfflineMergeError();
      return api.post<MergePeopleResult>(`/api/people/${id}/merge`, { into });
    },
    // Online-only and never retried or replayed (see isReplayableWrite): a repeat after a lost
    // response would 404 on the removed duplicate.
    networkMode: "always",
    retry: false,
    onSuccess: ({ person }: MergePeopleResult, { id }: MergePeopleVars) => {
      forgetMergedPerson(qc, id, person.id);
      putPerson(qc, person);
    },
    onError: (e: unknown) => toast.error("Couldn’t merge", { description: errorText(e) }),
    onSettled: (_d: unknown, _e: unknown, { id, into }: MergePeopleVars) => {
      qc.invalidateQueries({ queryKey: ["reminders"] });
      // Every note list (Today, the kept person's) — except the duplicate's own, which is going away.
      qc.invalidateQueries({ queryKey: ["notes"], predicate: (q) => !(q.queryKey[1] === "person" && q.queryKey[2] === id) });
      qc.invalidateQueries({ queryKey: chatKeys.threads() });
      qc.invalidateQueries({ queryKey: keys.stats() });
      invalidatePeople(qc, into);
    },
  });
  registerTaxonomyMutations(qc);
  registerReminderMutations(qc);
}

/** Entities a person write references that may still be queued: new activities, the introducer. */
function personDeps(variables: unknown): string[] {
  const v = variables as (Partial<PersonInput> & { patch?: PersonPatch }) | string | undefined;
  if (!v || typeof v === "string") return [];
  const fields = v.patch ?? v;
  return [...(fields.activityIds ?? []).map(activityEntity), personEntity(fields.introducedById)].filter((e): e is string => !!e);
}

/**
 * Runs a person mutation through its defaults, serialized with other writes to the same person —
 * and behind a new activity or introducer it references whose create is still queued.
 */
function runPerson<TData, TVars>(qc: QueryClient, mutationKey: readonly unknown[], variables: TVars, personId: string): Promise<TData> {
  const scope = scopeFor(qc, `person:${personId}`, personDeps(variables));
  const mutation = qc.getMutationCache().build<TData, Error, TVars, unknown>(qc, { mutationKey, scope: { id: scope } });
  return mutation.execute(variables);
}

const ignore = () => {};

/**
 * Fire-and-forget person writes: the cache (detail + index) updates instantly, requests run in
 * the background in per-person order (create → edits → delete), offline writes replay on reconnect.
 */
export function personWrites(qc: QueryClient) {
  return {
    /** Creates a person and returns their (client-generated) id — navigate to it right away. */
    create(input: PersonInput): string {
      const id = input.id ?? crypto.randomUUID();
      runPerson(qc, MUT.createPerson, { ...input, id }, id).catch(ignore);
      return id;
    },
    update(id: string, patch: PersonPatch) {
      runPerson(qc, MUT.updatePerson, { id, patch }, id).catch(ignore);
    },
    remove(id: string) {
      runPerson(qc, MUT.deletePerson, id, id).catch(ignore);
    },
    restore(id: string): Promise<PersonDetailApi> {
      return runPerson<PersonDetailApi, string>(qc, MUT.restorePerson, id, id);
    },
    /** Merges `id` into `into`, behind the duplicate's queued writes (else the kept person's). Rejects (and toasts) offline. */
    merge(id: string, into: string): Promise<MergePeopleResult> {
      const scope = scopeFor(qc, `person:${id}`, [personEntity(into)]);
      const mutation = qc.getMutationCache().build<MergePeopleResult, Error, MergePeopleVars, unknown>(qc, { mutationKey: MUT.mergePeople, scope: { id: scope } });
      return mutation.execute({ id, into });
    },
  };
}

/** `personWrites` for components. */
export function usePersonWrites() {
  const qc = useQueryClient();
  return useMemo(() => personWrites(qc), [qc]);
}

/* ---------- v1-compatible hooks ---------- */

/**
 * Creates a person. A client-generated id is attached at call time, so retries and offline replays
 * after a reload hit the same id (the server treats repeats as idempotent).
 */
export function useCreatePerson() {
  const m = useMutation<PersonDetailApi, Error, CreatePersonVars>({ mutationKey: MUT.createPerson });
  return { ...m, mutate: (input: PersonInput, opts?: Parameters<typeof m.mutate>[1]) => m.mutate({ ...input, id: input.id ?? crypto.randomUUID() }, opts) };
}

export function useUpdatePerson(id: string) {
  const m = useMutation<PersonDetailApi, Error, UpdatePersonVars>({ mutationKey: MUT.updatePerson, scope: { id: `person:${id}` } });
  return { ...m, mutate: (patch: PersonPatch, opts?: Parameters<typeof m.mutate>[1]) => m.mutate({ id, patch }, opts) };
}

export function useDeletePerson() {
  return useMutation<unknown, Error, string>({ mutationKey: MUT.deletePerson });
}

export function useRestorePerson() {
  return useMutation<PersonDetailApi, Error, string>({ mutationKey: MUT.restorePerson });
}
