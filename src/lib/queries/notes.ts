"use client";
import { useMutation, useQuery, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { NoteInput, NotePatch } from "@/lib/schemas";
import { keys } from "./keys";
import type { NoteDetail, RecentNote } from "./types";

export const NOTE_MUT = {
  create: ["notes", "create"] as const,
  update: ["notes", "update"] as const,
  delete: ["notes", "delete"] as const,
};

export function useNote(id: string | null) {
  return useQuery({ queryKey: keys.note(id ?? ""), queryFn: () => api.get<NoteDetail>(`/api/notes/${id}`), enabled: !!id });
}

export function useRecentNotes(limit = 8) {
  return useQuery({ queryKey: keys.recentNotes(), queryFn: () => api.get<RecentNote[]>(`/api/notes?limit=${limit}`) });
}

export function registerNoteMutations(qc: QueryClient) {
  const invalidate = (personId?: string) => {
    if (personId) qc.invalidateQueries({ queryKey: keys.person(personId) });
    qc.invalidateQueries({ queryKey: keys.recentNotes() });
    qc.invalidateQueries({ queryKey: ["people"] });
  };
  qc.setMutationDefaults(NOTE_MUT.create, {
    mutationFn: (input: NoteInput) => api.post<NoteDetail>("/api/notes", input),
    onSuccess: (data: NoteDetail) => {
      qc.setQueryData(keys.note(data.id), data);
      invalidate(data.personId);
    },
  });
  qc.setMutationDefaults(NOTE_MUT.update, {
    mutationFn: ({ id, patch }: { id: string; patch: NotePatch }) => api.patch<NoteDetail>(`/api/notes/${id}`, patch),
    onSuccess: (data: NoteDetail) => {
      qc.setQueryData(keys.note(data.id), data);
      invalidate(data.personId);
    },
  });
  qc.setMutationDefaults(NOTE_MUT.delete, {
    mutationFn: ({ id }: { id: string; personId: string }) => api.delete(`/api/notes/${id}`),
    onSuccess: (_d: unknown, v: { id: string; personId: string }) => invalidate(v.personId),
  });
}

export function useCreateNote() {
  return useMutation<NoteDetail, Error, NoteInput>({ mutationKey: NOTE_MUT.create });
}
export function useUpdateNote() {
  return useMutation<NoteDetail, Error, { id: string; patch: NotePatch }>({ mutationKey: NOTE_MUT.update });
}
export function useDeleteNote() {
  return useMutation<unknown, Error, { id: string; personId: string }>({ mutationKey: NOTE_MUT.delete });
}
