"use client";
/**
 * Notes on the client: reads, lazy drafts and offline-safe writes.
 *
 * Lazy creation — "New note" never touches the server:
 *   const newNote = useNewNote();  newNote(personId)          // seeds a draft, opens the editor
 *   startNoteDraft(qc, { personId, contentMd })               // seed only (e.g. carry a draft)
 * The editor saves on the first non-empty change (idempotent PUT with the client id).
 *
 * Writes go through mutation defaults (so paused/offline writes resume after a reload) and run
 * in a per-note scope (`note:<id>`), so create → updates → delete always reach the server in
 * order. Each write patches the caches optimistically (see lib/notes/cache).
 */
import { MutationObserver, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { toast } from "@/components/ui/Toast";
import { api, ApiError } from "@/lib/api";
import type { NoteKind } from "@/lib/constants";
import {
  makeDraftNote,
  noteScopeId,
  pendingNoteWrites,
  removeNoteFromLists,
  scheduleNotesSync,
  toSummary,
  upsertNoteInLists,
  type DraftInput,
  type NoteDoc,
} from "@/lib/notes/cache";
import type { NoteInput, NotePatch, NoteUpsert } from "@/lib/schemas";
import { withContentText } from "./compat";
import { keys } from "./keys";
import type { NoteDetail, NoteSearchHit, NoteSummary, RecentNoteApi } from "./types";

export type { NoteDoc } from "@/lib/notes/cache";

export const NOTE_MUT = {
  create: ["notes", "create"] as const,
  upsert: ["notes", "upsert"] as const,
  update: ["notes", "update"] as const,
  delete: ["notes", "delete"] as const,
  restore: ["notes", "restore"] as const,
};

export type UpsertVars = {
  id: string;
  body: NoteUpsert;
  /** First save of a draft (counts toward the person's notesCount). */
  isNew?: boolean;
  /** Refresh lists after it lands (one-off actions; the editor syncs once on leave instead). */
  sync?: boolean;
  /** The person the note is moving away from. */
  fromPersonId?: string | null;
  /** An autosave of the content: a newer one may replace it while it waits in the queue. */
  content?: boolean;
};
export type DeleteVars = { id: string; personId: string; persisted?: boolean };
export type RestoreVars = { id: string; personId: string; summary?: NoteSummary };

/* ------------------------------------------------------------------ */
/*  Reads                                                              */
/* ------------------------------------------------------------------ */

/**
 * One note for the editor. A local draft (or a note whose create is still queued) is served from
 * the cache and never fetched. A 404 for an id we don't know yet becomes an empty draft for that
 * id (reloading an unsaved "New note"); a 404 for a note we had means it was deleted.
 */
export function useNoteDoc(id: string | null, opts: { personId?: string } = {}) {
  const qc = useQueryClient();
  return useQuery<NoteDoc>({
    queryKey: keys.note(id ?? ""),
    queryFn: async () => {
      const cached = qc.getQueryData<NoteDoc>(keys.note(id!));
      if (cached && pendingNoteWrites(qc, id!).length) return cached; // a save is on its way: the cache is newer
      try {
        return await api.get<NoteDoc>(`/api/notes/${id}`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          if (cached && !cached.localOnly) return { ...cached, deleted: true };
          if (cached) return cached;
          if (opts.personId) return makeDraftNote({ id: id!, personId: opts.personId });
        }
        throw e;
      }
    },
    enabled: (q) => !!id && !q.state.data?.localOnly,
    retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
  });
}

/** @deprecated use useNoteDoc */
export const useNote = (id: string | null) => useNoteDoc(id);

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

/* ------------------------------------------------------------------ */
/*  Mutation defaults                                                  */
/* ------------------------------------------------------------------ */

/** 4xx never retries; 5xx a few times; network errors keep trying (and pause while offline). */
function retry(failureCount: number, error: unknown) {
  if (error instanceof ApiError) return error.status >= 500 && failureCount < 3;
  return true;
}
const retryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 30_000);

const CONTENT_KEYS = ["title", "contentJson", "contentMd", "contentText", "kind", "occurredAt", "pinned", "personId"] as const;

function applyUpsert(qc: QueryClient, { id, body, isNew, fromPersonId }: UpsertVars) {
  const prev = qc.getQueryData<NoteDoc>(keys.note(id));
  if (!prev && !body.personId) return;
  const base = prev ?? makeDraftNote({ id, personId: body.personId! });
  const next: NoteDoc = { ...base, updatedAt: new Date().toISOString() as unknown as Date };
  if (body.title !== undefined) next.title = body.title ?? null;
  if (body.contentJson !== undefined) next.contentJson = body.contentJson ?? null;
  if (body.contentMd !== undefined) next.contentMd = body.contentMd;
  if (body.contentText !== undefined) next.contentText = body.contentText;
  if (body.kind) next.kind = body.kind;
  if (body.occurredAt) next.occurredAt = body.occurredAt as unknown as Date;
  if (body.pinned !== undefined) next.pinned = body.pinned;
  if (body.personId) next.personId = body.personId;
  if (body.restore) next.deleted = false;
  qc.setQueryData(keys.note(id), next);
  if (next.deleted) return;
  const from = fromPersonId ?? (prev && prev.personId !== next.personId ? prev.personId : null);
  upsertNoteInLists(qc, toSummary(next), { isNew: isNew || body.restore, fromPersonId: from });
}

export function registerNoteMutations(qc: QueryClient) {
  const onSaved = (data: NoteDetail) => {
    qc.setQueryData(keys.note(data.id), data);
    upsertNoteInLists(qc, toSummary(data));
    scheduleNotesSync(qc, [data.personId]);
  };

  // Legacy create (POST-like PUT with a client id); empty creates never reach it (see useCreateNote).
  qc.setMutationDefaults(NOTE_MUT.create, {
    mutationFn: ({ id, ...input }: NoteInput & { id: string }) => api.put<NoteDetail>(`/api/notes/${id}`, input),
    retry,
    retryDelay,
    onSuccess: onSaved,
  });

  qc.setMutationDefaults(NOTE_MUT.upsert, {
    mutationFn: ({ id, body }: UpsertVars) => api.put<NoteDetail>(`/api/notes/${id}`, body),
    retry,
    retryDelay,
    onMutate: (vars: UpsertVars) => applyUpsert(qc, vars),
    onSuccess: (data: NoteDetail, vars: UpsertVars) => {
      // Newer writes for this note are queued: keep their optimistic content, take server metadata.
      const newer = pendingNoteWrites(qc, vars.id, vars).length > 0;
      qc.setQueryData<NoteDoc>(keys.note(data.id), (prev) => {
        if (!newer || !prev) return data;
        const merged: NoteDoc = { ...data };
        for (const k of CONTENT_KEYS) (merged as Record<string, unknown>)[k] = prev[k];
        return merged;
      });
      if (!newer) upsertNoteInLists(qc, toSummary(data));
      if (vars.sync) scheduleNotesSync(qc, [data.personId, vars.fromPersonId]);
    },
    onError: (error: Error, vars: UpsertVars) => {
      if (error instanceof ApiError && error.status === 410) {
        qc.setQueryData<NoteDoc>(keys.note(vars.id), (p) => (p ? { ...p, deleted: true } : p));
        return;
      }
      const description = error instanceof ApiError && error.status === 404 ? "This person no longer exists." : error.message;
      toast.error("Couldn’t save note", { id: `note-save-${vars.id}`, description });
      scheduleNotesSync(qc, [vars.body.personId, vars.fromPersonId]);
    },
  });

  qc.setMutationDefaults(NOTE_MUT.update, {
    mutationFn: ({ id, patch }: { id: string; patch: NotePatch }) => api.patch<NoteDetail>(`/api/notes/${id}`, patch),
    retry,
    retryDelay,
    onSuccess: (data: NoteDetail, v: { id: string; patch: NotePatch }) => {
      onSaved(data);
      if (v.patch.personId) qc.invalidateQueries({ queryKey: ["person"] });
    },
  });

  qc.setMutationDefaults(NOTE_MUT.delete, {
    mutationFn: ({ id }: DeleteVars) => api.delete(`/api/notes/${id}`),
    retry,
    retryDelay,
    onMutate: ({ id, personId, persisted }: DeleteVars) => {
      removeNoteFromLists(qc, id, personId, { countDelta: persisted === false ? 0 : -1 });
      qc.setQueryData<NoteDoc>(keys.note(id), (p) => (p ? { ...p, deleted: true } : p));
    },
    onSuccess: (_d: unknown, v: DeleteVars) => scheduleNotesSync(qc, [v.personId]),
    onError: (error: Error, v: DeleteVars) => {
      if (!(error instanceof ApiError && error.status === 404)) toast.error("Couldn’t delete note", { description: error.message });
      scheduleNotesSync(qc, [v.personId], 0);
    },
  });

  qc.setMutationDefaults(NOTE_MUT.restore, {
    // Older persisted mutations pass the bare id.
    mutationFn: (v: string | RestoreVars) => api.post<NoteDetail>(`/api/notes/${typeof v === "string" ? v : v.id}/restore`),
    retry,
    retryDelay,
    onMutate: (v: string | RestoreVars) => {
      if (typeof v === "string") return;
      const doc = qc.getQueryData<NoteDoc>(keys.note(v.id));
      if (doc) qc.setQueryData<NoteDoc>(keys.note(v.id), { ...doc, deleted: false });
      const summary = v.summary ?? (doc ? toSummary(doc) : null);
      if (summary) upsertNoteInLists(qc, summary, { isNew: true });
    },
    onSuccess: (data: NoteDetail) => onSaved(data),
    onError: (error: Error) => toast.error("Couldn’t restore note", { description: error.message }),
  });
}

/* ------------------------------------------------------------------ */
/*  Imperative writes (usable outside React render, e.g. on pagehide)  */
/* ------------------------------------------------------------------ */

/** Runs a note mutation in the note's scope. Never throws (errors are handled by the defaults). */
function runNoteMutation<TVars>(qc: QueryClient, mutationKey: readonly unknown[], id: string, vars: TVars) {
  const observer = new MutationObserver<unknown, Error, TVars>(qc, { mutationKey, scope: { id: noteScopeId(id) } });
  return observer
    .mutate(vars)
    .catch(() => undefined)
    .finally(() => observer.reset());
}

/** Drops content autosaves for this note that are still waiting in the queue (a newer one replaces them). */
function dropQueuedAutosaves(qc: QueryClient, id: string) {
  const cache = qc.getMutationCache();
  for (const m of pendingNoteWrites(qc, id)) {
    const v = m.state.variables as UpsertVars | undefined;
    if (m.state.isPaused && v?.content && !v.isNew) cache.remove(m);
  }
}

/** Idempotent create-or-update of a note (PUT). Works offline; serialized per note. */
export function saveNote(qc: QueryClient, id: string, body: NoteUpsert, opts: Omit<UpsertVars, "id" | "body"> = {}) {
  if (opts.content) dropQueuedAutosaves(qc, id);
  return runNoteMutation<UpsertVars>(qc, NOTE_MUT.upsert, id, { id, body, ...opts });
}

/**
 * Soft-deletes a note and offers Undo. A note that only ever existed locally is just dropped.
 * Returns nothing; the toast's Undo restores the note (and calls `onUndo`, e.g. to navigate back).
 */
export function deleteNote(
  qc: QueryClient,
  note: { id: string; personId: string; summary?: NoteSummary },
  opts: { message?: string; undo?: boolean; onUndo?: () => void } = {},
) {
  const doc = qc.getQueryData<NoteDoc>(keys.note(note.id));
  const localDraft = !!doc?.localOnly && pendingNoteWrites(qc, note.id).length === 0;
  if (localDraft) {
    qc.removeQueries({ queryKey: keys.note(note.id), exact: true });
    removeNoteFromLists(qc, note.id, note.personId, { countDelta: 0 });
    return;
  }
  const summary = note.summary ?? (doc ? toSummary(doc) : undefined);
  runNoteMutation<DeleteVars>(qc, NOTE_MUT.delete, note.id, { id: note.id, personId: note.personId });
  if (opts.undo === false) return;
  toast.undo(opts.message ?? "Note deleted", () => {
    runNoteMutation<RestoreVars>(qc, NOTE_MUT.restore, note.id, { id: note.id, personId: note.personId, summary });
    opts.onUndo?.();
  });
}

/** Brings a deleted note back (with its current content when `body` is given). */
export function restoreNote(qc: QueryClient, id: string, personId: string, body?: NoteUpsert) {
  if (body) return saveNote(qc, id, { ...body, personId, restore: true }, { sync: true });
  return runNoteMutation<RestoreVars>(qc, NOTE_MUT.restore, id, { id, personId });
}

/* ------------------------------------------------------------------ */
/*  Lazy creation                                                      */
/* ------------------------------------------------------------------ */

/** Seeds a local draft in the cache (nothing is saved) and returns its id. */
export function startNoteDraft(qc: QueryClient, input: Omit<DraftInput, "id"> & { id?: string }): string {
  const id = input.id ?? crypto.randomUUID();
  qc.setQueryData(keys.note(id), makeDraftNote({ ...input, id }));
  return id;
}

/** `newNote(personId, draft?)`: seeds a draft and opens the editor instantly (works offline). */
export function useNewNote() {
  const qc = useQueryClient();
  const router = useRouter();
  return useCallback(
    (personId: string, draft: Omit<DraftInput, "id" | "personId"> = {}) => {
      const id = startNoteDraft(qc, { ...draft, personId });
      router.push(`/people/${personId}/notes/${id}`, { transitionTypes: ["nav-forward"] });
      return id;
    },
    [qc, router],
  );
}

/** Row / menu actions on saved notes. */
export function useNoteActions() {
  const qc = useQueryClient();
  return useMemo(
    () => ({
      setPinned: (n: { id: string; personId: string }, pinned: boolean) => saveNote(qc, n.id, { personId: n.personId, pinned }, { sync: true }),
      setKind: (n: { id: string; personId: string }, kind: NoteKind) => saveNote(qc, n.id, { personId: n.personId, kind }, { sync: true }),
      move: (n: { id: string; personId: string }, toPersonId: string) =>
        saveNote(qc, n.id, { personId: toPersonId }, { sync: true, fromPersonId: n.personId }),
      remove: (n: NoteSummary, opts?: { message?: string; onUndo?: () => void }) => deleteNote(qc, { id: n.id, personId: n.personId, summary: n }, opts),
    }),
    [qc],
  );
}

/* ------------------------------------------------------------------ */
/*  Hook wrappers (kept for existing screens)                          */
/* ------------------------------------------------------------------ */

/**
 * Creates a note with a client-generated id (idempotent PUT). An empty note is never created:
 * it becomes a local draft and `onSuccess` receives it immediately, so "New note" buttons keep
 * working and nothing is saved until the first keystroke.
 */
export function useCreateNote() {
  const qc = useQueryClient();
  const m = useMutation<NoteDetail, Error, NoteInput & { id: string }>({ mutationKey: NOTE_MUT.create });
  return {
    ...m,
    mutate: (input: NoteInput & { id?: string }, opts?: Parameters<typeof m.mutate>[1]) => {
      const id = input.id ?? crypto.randomUUID();
      if (!input.title?.trim() && !input.contentText?.trim() && !input.contentMd?.trim()) {
        startNoteDraft(qc, { id, personId: input.personId, kind: input.kind, occurredAt: input.occurredAt });
        const draft = qc.getQueryData<NoteDoc>(keys.note(id))!;
        (opts?.onSuccess as ((d: NoteDetail, v: NoteInput & { id: string }) => void) | undefined)?.(draft, { ...input, id });
        return;
      }
      m.mutate({ ...input, id }, opts);
    },
  };
}
export function useUpsertNote() {
  return useMutation<NoteDetail, Error, UpsertVars>({ mutationKey: NOTE_MUT.upsert });
}
export function useUpdateNote() {
  return useMutation<NoteDetail, Error, { id: string; patch: NotePatch }>({ mutationKey: NOTE_MUT.update });
}
export function useDeleteNote() {
  return useMutation<unknown, Error, DeleteVars>({ mutationKey: NOTE_MUT.delete });
}
export function useRestoreNote() {
  return useMutation<NoteDetail, Error, string | RestoreVars>({ mutationKey: NOTE_MUT.restore });
}
