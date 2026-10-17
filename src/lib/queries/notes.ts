"use client";
import { useMutation, useQuery, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "@/lib/api";
import type { NoteInput, NotePatch, NoteUpsert } from "@/lib/schemas";
import { withContentText } from "./compat";
import { keys } from "./keys";
import type { NoteDetail, NoteSearchHit, RecentNoteApi } from "./types";

export const NOTE_MUT = {
  create: ["notes", "create"] as const,
  upsert: ["notes", "upsert"] as const,
  update: ["notes", "update"] as const,
  delete: ["notes", "delete"] as const,
  restore: ["notes", "restore"] as const,
};

export function useNote(id: string | null) {
  return useQuery({ queryKey: keys.note(id ?? ""), queryFn: () => api.get<NoteDetail>(`/api/notes/${id}`), enabled: !!id });
}

/** Recently edited notes (v1 rows also get `contentText` = excerpt). */
export function useRecentNotes(limit = 8) {
  const q = useQuery({ queryKey: keys.recentNotes(), queryFn: () => api.get<RecentNoteApi[]>(`/api/notes?limit=${limit}`) });
  const data = useMemo(() => q.data?.map(withContentText), [q.data]);
  return { ...q, data };
}

/** Ranked full-text note search with highlighted snippets. */
export function useNoteSearch(query: string, opts: { personId?: string; limit?: number } = {}) {
  const q = query.trim();
  return useQuery({
    queryKey: keys.noteSearch(q, opts.personId),
    queryFn: () => {
      const qs = new URLSearchParams({ q, limit: String(opts.limit ?? 20) });
      if (opts.personId) qs.set("person", opts.personId);
      return api.get<NoteSearchHit[]>(`/api/notes?${qs}`);
    },
    enabled: q.length >= 2,
    placeholderData: (prev) => prev,
  });
}

export function registerNoteMutations(qc: QueryClient) {
  const invalidate = (personId?: string) => {
    if (personId) qc.invalidateQueries({ queryKey: keys.person(personId) });
    qc.invalidateQueries({ queryKey: ["notes"] });
    qc.invalidateQueries({ queryKey: ["people"] });
  };
  const onSaved = (data: NoteDetail) => {
    qc.setQueryData(keys.note(data.id), data);
    invalidate(data.personId);
  };
  // Creates go through the idempotent PUT with a client-generated id (see useCreateNote).
  qc.setMutationDefaults(NOTE_MUT.create, {
    mutationFn: ({ id, ...input }: NoteInput & { id: string }) => api.put<NoteDetail>(`/api/notes/${id}`, input),
    onSuccess: onSaved,
  });
  qc.setMutationDefaults(NOTE_MUT.upsert, {
    mutationFn: ({ id, body }: { id: string; body: NoteUpsert }) => api.put<NoteDetail>(`/api/notes/${id}`, body),
    onSuccess: onSaved,
  });
  qc.setMutationDefaults(NOTE_MUT.update, {
    mutationFn: ({ id, patch }: { id: string; patch: NotePatch }) => api.patch<NoteDetail>(`/api/notes/${id}`, patch),
    onSuccess: (data: NoteDetail, v: { id: string; patch: NotePatch }) => {
      onSaved(data);
      // A moved note also leaves its previous person.
      if (v.patch.personId) qc.invalidateQueries({ queryKey: ["person"] });
    },
  });
  qc.setMutationDefaults(NOTE_MUT.delete, {
    mutationFn: ({ id }: { id: string; personId: string }) => api.delete(`/api/notes/${id}`),
    onSuccess: (_d: unknown, v: { id: string; personId: string }) => invalidate(v.personId),
  });
  qc.setMutationDefaults(NOTE_MUT.restore, {
    mutationFn: (id: string) => api.post<NoteDetail>(`/api/notes/${id}/restore`),
    onSuccess: onSaved,
  });
}

/** Creates a note with a client-generated id (idempotent PUT), so offline replays never duplicate it. */
export function useCreateNote() {
  const m = useMutation<NoteDetail, Error, NoteInput & { id: string }>({ mutationKey: NOTE_MUT.create });
  return {
    ...m,
    mutate: (input: NoteInput & { id?: string }, opts?: Parameters<typeof m.mutate>[1]) => m.mutate({ ...input, id: input.id ?? crypto.randomUUID() }, opts),
  };
}
export function useUpsertNote() {
  return useMutation<NoteDetail, Error, { id: string; body: NoteUpsert }>({ mutationKey: NOTE_MUT.upsert });
}
export function useUpdateNote() {
  return useMutation<NoteDetail, Error, { id: string; patch: NotePatch }>({ mutationKey: NOTE_MUT.update });
}
export function useDeleteNote() {
  return useMutation<unknown, Error, { id: string; personId: string }>({ mutationKey: NOTE_MUT.delete });
}
export function useRestoreNote() {
  return useMutation<NoteDetail, Error, string>({ mutationKey: NOTE_MUT.restore });
}
