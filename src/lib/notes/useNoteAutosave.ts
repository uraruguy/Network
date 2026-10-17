"use client";
/**
 * Autosave for the note editor — Apple Notes semantics:
 *
 * - Nothing is written until the note has words. Opening "New note" and leaving saves nothing.
 * - Changes save 600ms after the last keystroke, and immediately when the tab is hidden, the
 *   page is closing or the editor unmounts. Saves are idempotent PUTs queued per note, so they
 *   serialize and survive going offline or a reload.
 * - Emptying a saved note never writes the empty state; leaving it empty soft-deletes it with
 *   an Undo that brings back the last words it had.
 *
 * The decisions are pure (`planSave`, `planLeave`) and unit-tested.
 */
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { JSONContent } from "@tiptap/react";
import { useCallback, useEffect, useRef } from "react";
import type { NoteKind } from "@/lib/constants";
import { deleteNote, saveNote } from "@/lib/queries/notes";
import { keys } from "@/lib/queries/keys";
import type { NoteUpsert } from "@/lib/schemas";
import { pendingNoteWrites, scheduleNotesSync, type NoteDoc } from "./cache";
import { isBlankContent } from "./title";

export const AUTOSAVE_DELAY = 600;

export type NoteContent = { json: JSONContent; md: string; text: string; title: string | null };
export type ContentSnapshot = { text: string; title: string | null; fingerprint: string };

export type AutosaveState = {
  /** The server has the note, or a create for it is queued. */
  persisted: boolean;
  /** Fingerprint of the content last handed to the queue (null: nothing yet). */
  lastSaved: string | null;
};

export type SavePlan = { kind: "skip"; reason: "empty" | "unchanged" } | { kind: "save"; isNew: boolean };
export type LeavePlan = "nothing" | "save" | "delete-empty" | "discard-draft";

export const fingerprint = (json: JSONContent) => JSON.stringify(json);

/** What to do with the editor's current content on a (debounced) save. */
export function planSave(state: AutosaveState, c: ContentSnapshot): SavePlan {
  if (isBlankContent({ title: c.title, contentText: c.text })) return { kind: "skip", reason: "empty" };
  if (c.fingerprint === state.lastSaved) return { kind: "skip", reason: "unchanged" };
  return { kind: "save", isNew: !state.persisted };
}

/** What to do when the user leaves the note. `c` is null when the editor never loaded. */
export function planLeave(state: AutosaveState, c: ContentSnapshot | null): LeavePlan {
  if (!c) return state.persisted ? "nothing" : "discard-draft";
  if (isBlankContent({ title: c.title, contentText: c.text })) return state.persisted ? "delete-empty" : "discard-draft";
  return c.fingerprint === state.lastSaved ? "nothing" : "save";
}

const snapshot = (c: NoteContent): ContentSnapshot => ({ text: c.text, title: c.title, fingerprint: fingerprint(c.json) });

/** PUT body for a content save. Drafts also carry their kind/date/pin so the create is complete. */
function contentBody(qc: QueryClient, id: string, personId: string, c: NoteContent, isNew: boolean): NoteUpsert {
  const doc = qc.getQueryData<NoteDoc>(keys.note(id));
  const body: NoteUpsert = { personId, title: c.title, contentJson: c.json, contentMd: c.md, contentText: c.text };
  if ((isNew || doc?.localOnly) && doc) {
    body.kind = doc.kind as NoteKind;
    body.occurredAt = new Date(doc.occurredAt).toISOString();
    body.pinned = doc.pinned;
  }
  return body;
}

/** Leaves scheduled by unmounts; a quick remount of the same note (StrictMode, back/forward) cancels them. */
const pendingLeaves = new Map<string, ReturnType<typeof setTimeout>>();

function performLeave(qc: QueryClient, id: string, personId: string, state: AutosaveState, c: NoteContent | null, touched: boolean) {
  const plan = planLeave(state, c ? snapshot(c) : null);
  if (plan === "save" && c) {
    saveNote(qc, id, contentBody(qc, id, personId, c, !state.persisted), { content: true, isNew: !state.persisted });
    scheduleNotesSync(qc, [personId]);
  } else if (plan === "delete-empty") {
    deleteNote(qc, { id, personId }, { message: "Empty note removed" });
  } else if (plan === "discard-draft") {
    const query = qc.getQueryCache().find({ queryKey: keys.note(id), exact: true });
    if (query && query.getObserversCount() === 0 && !pendingNoteWrites(qc, id).length) qc.removeQueries({ queryKey: keys.note(id), exact: true });
  } else if (touched) {
    scheduleNotesSync(qc, [personId]);
  }
}

export type MetaPatch = { kind?: NoteKind; occurredAt?: string; pinned?: boolean; personId?: string };

export function useNoteAutosave({
  noteId,
  personId,
  read,
  disabled = false,
}: {
  noteId: string;
  personId: string;
  /** Reads the editor's current content (null until the editor exists). */
  read: () => NoteContent | null;
  /** Stop saving (e.g. the note was deleted elsewhere). */
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const state = useRef<AutosaveState>({ persisted: false, lastSaved: null });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touched = useRef(false);
  const latest = useRef({ read, personId, disabled });
  useEffect(() => {
    latest.current = { read, personId, disabled };
  });

  // An instant remount of the same note (StrictMode, fast back/forward) cancels the pending leave.
  useEffect(() => {
    const t = pendingLeaves.get(noteId);
    if (t) {
      clearTimeout(t);
      pendingLeaves.delete(noteId);
    }
  }, [noteId]);

  /** Persisted = the server has the note or a create is queued. Only ever flips false → true. */
  const persisted = useCallback(() => {
    if (!state.current.persisted) {
      const doc = qc.getQueryData<NoteDoc>(keys.note(noteId));
      state.current.persisted = !!doc && (!doc.localOnly || pendingNoteWrites(qc, noteId).length > 0);
    }
    return state.current.persisted;
  }, [noteId, qc]);

  const save = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const { read, personId, disabled } = latest.current;
    if (disabled) return;
    const c = read();
    if (!c) return;
    const snap = snapshot(c);
    persisted();
    const plan = planSave(state.current, snap);
    if (plan.kind === "skip") return;
    saveNote(qc, noteId, contentBody(qc, noteId, personId, c, plan.isNew), { content: true, isNew: plan.isNew });
    state.current = { persisted: true, lastSaved: snap.fingerprint };
    touched.current = true;
  }, [noteId, qc, persisted]);

  /** Call on every document change. */
  const changed = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, AUTOSAVE_DELAY);
  }, [save]);

  /**
   * Call once the editor has its initial content: that content counts as saved — except for an
   * unsaved draft that already has words (carried over from the quick composer), which saves now.
   */
  const ready = useCallback(
    (c: NoteContent) => {
      const snap = snapshot(c);
      const blank = isBlankContent({ title: snap.title, contentText: snap.text });
      if (!persisted() && !blank) {
        state.current.lastSaved = null;
        save();
      } else {
        state.current.lastSaved = snap.fingerprint;
      }
    },
    [save, persisted],
  );

  /** Kind / date / pin / person. Drafts keep them locally until their first save. */
  const saveMeta = useCallback(
    (patch: MetaPatch) => {
      const doc = qc.getQueryData<NoteDoc>(keys.note(noteId));
      const from = patch.personId && doc && doc.personId !== patch.personId ? doc.personId : null;
      if (patch.personId) latest.current.personId = patch.personId;
      if (persisted()) {
        saveNote(qc, noteId, { personId: latest.current.personId, ...patch }, { sync: true, fromPersonId: from });
        touched.current = true;
      } else if (doc) {
        qc.setQueryData<NoteDoc>(keys.note(noteId), { ...doc, ...patch, occurredAt: (patch.occurredAt ?? doc.occurredAt) as unknown as Date });
      }
    },
    [noteId, qc, persisted],
  );

  // Save right away when the app goes to the background or the page closes.
  useEffect(() => {
    const onVisibility = () => document.visibilityState === "hidden" && save();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", save);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", save);
    };
  }, [save]);

  // Leaving: snapshot now (the editor still exists), decide a tick later.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const { read, personId, disabled } = latest.current;
      if (disabled) return;
      let content: NoteContent | null = null;
      try {
        content = read();
      } catch {
        content = null;
      }
      persisted();
      const st = { ...state.current };
      const wasTouched = touched.current;
      pendingLeaves.set(
        noteId,
        setTimeout(() => {
          pendingLeaves.delete(noteId);
          performLeave(qc, noteId, personId, st, content, wasTouched);
        }, 0),
      );
    },
    [noteId, qc, persisted],
  );

  return {
    changed,
    ready,
    flush: save,
    saveMeta,
    /** True once the server has (or will have) this note. */
    isPersisted: persisted,
  };
}
