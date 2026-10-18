"use client";
/**
 * Autosave for the note editor — Apple Notes semantics:
 *
 * - Nothing is written until the note has words. Opening "New note" and leaving saves nothing.
 * - Changes save 600ms after the last keystroke, and immediately when the tab is hidden, the
 *   page is closing or the editor unmounts. Saves are idempotent PUTs queued per note, so they
 *   serialize and survive going offline or a reload; the save on pagehide outlives the page
 *   (keepalive) and the queue is flushed to IndexedDB right away.
 * - Emptying a saved note never writes the empty state; leaving it empty soft-deletes it with
 *   an Undo that brings back the last words it had.
 * - Saves are conditional on the version the editor opened (see ./version): a fresher server
 *   copy replaces the editor's content while nothing is unsaved; with unsaved words the server
 *   refuses the save and both versions are kept (keepBothVersions in lib/queries/notes).
 *
 * The decisions are pure (`planSave`, `planLeave`, `planServerDoc`) and unit-tested.
 */
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { NoteKind } from "@/lib/constants";
import { flushPersistedCache } from "@/lib/offline/queryClient";
import { deleteNote, saveNote } from "@/lib/queries/notes";
import { keys } from "@/lib/queries/keys";
import type { NoteUpsert } from "@/lib/schemas";
import { pendingNoteWrites, scheduleNotesSync, type NoteDoc } from "./cache";
import { fingerprint, initialChain, planLeave, planSave, planServerDoc, type AutosaveState, type ContentSnapshot, type NoteContent } from "./autosave";
import { isBlankContent } from "./title";
import { contentVersion, extendChain, type VersionSource } from "./version";

export type { AutosaveState, ContentSnapshot, LeavePlan, NoteContent, SavePlan } from "./autosave";
export { planLeave, planSave } from "./autosave";

export const AUTOSAVE_DELAY = 600;

const snapshot = (c: NoteContent): ContentSnapshot => ({ text: c.text, title: c.title, fingerprint: fingerprint(c.json) });
const versionOf = (c: NoteContent) => contentVersion({ contentText: c.text, contentMd: c.md });

/** PUT body for a content save. Drafts also carry their kind/date/pin so the create is complete. */
function contentBody(qc: QueryClient, id: string, personId: string, c: NoteContent, isNew: boolean, chain: readonly string[] = []): NoteUpsert {
  const doc = qc.getQueryData<NoteDoc>(keys.note(id));
  const body: NoteUpsert = { personId, title: c.title, contentJson: c.json, contentMd: c.md, contentText: c.text };
  if ((isNew || doc?.localOnly) && doc) {
    body.kind = doc.kind as NoteKind;
    body.occurredAt = new Date(doc.occurredAt).toISOString();
    body.pinned = doc.pinned;
  }
  if (!isNew && chain.length) body.baseVersions = [...chain];
  return body;
}

/** A refused save forked the note into a copy (keepBothVersions): its page moves there. */
const isForked = (qc: QueryClient, id: string) => !!qc.getQueryData<NoteDoc>(keys.note(id))?.forkedTo;

/** Leaves scheduled by unmounts; a quick remount of the same note (StrictMode, back/forward) cancels them. */
const pendingLeaves = new Map<string, ReturnType<typeof setTimeout>>();

function performLeave(qc: QueryClient, id: string, personId: string, state: AutosaveState, c: NoteContent | null, touched: boolean) {
  const plan = isForked(qc, id) ? "nothing" : planLeave(state, c ? snapshot(c) : null);
  if (plan === "save" && c) {
    saveNote(qc, id, contentBody(qc, id, personId, c, !state.persisted, state.chain), { content: true, isNew: !state.persisted });
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

/** What the page hands over for `serverDoc`: the editor, to read or replace its whole content. */
export type EditorHandle = { read: () => NoteContent; replace: (note: Pick<NoteDoc, "contentJson" | "contentMd">) => void; isDestroyed: () => boolean };

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
  const state = useRef<AutosaveState>({ persisted: false, lastSaved: null, chain: [] });
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

  const save = useCallback(
    (opts: { keepalive?: boolean } = {}) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const { read, personId, disabled } = latest.current;
      if (disabled || isForked(qc, noteId)) return;
      const c = read();
      if (!c) return;
      const snap = snapshot(c);
      persisted();
      const plan = planSave(state.current, snap);
      if (plan.kind === "skip") return;
      const chain = state.current.chain ?? [];
      saveNote(qc, noteId, contentBody(qc, noteId, personId, c, plan.isNew, chain), { content: true, isNew: plan.isNew, keepalive: opts.keepalive });
      // The server will hold this version once the save lands: the next save may replace it too.
      state.current = { persisted: true, lastSaved: snap.fingerprint, chain: extendChain(chain, versionOf(c)) };
      touched.current = true;
    },
    [noteId, qc, persisted],
  );

  const flush = useCallback(() => save(), [save]);

  /** Call on every document change. */
  const changed = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, AUTOSAVE_DELAY);
  }, [flush]);

  /**
   * Call once the editor has its initial content (`source`: the note it was built from): that
   * content counts as saved — except for an unsaved draft that already has words (carried over
   * from the quick composer), which saves now.
   */
  const ready = useCallback(
    (c: NoteContent, source: VersionSource & { localOnly?: boolean; baseVersions?: string[] }) => {
      const snap = snapshot(c);
      const blank = isBlankContent({ title: snap.title, contentText: snap.text });
      state.current.chain = initialChain(source);
      if (!persisted() && !blank) {
        state.current.lastSaved = null;
        save();
      } else {
        state.current.lastSaved = snap.fingerprint;
      }
    },
    [save, persisted],
  );

  /**
   * Call when the cached note changes. Once a server copy is settled (nothing of ours queued),
   * our own save landing trims the version chain; another device's edit replaces the editor's
   * content while nothing here is unsaved.
   */
  const serverDoc = useCallback(
    (doc: NoteDoc, editor: EditorHandle | null) => {
      if (!editor || editor.isDestroyed() || latest.current.disabled) return;
      if (doc.localOnly || doc.syncPending || doc.deleted || doc.forkedTo || pendingNoteWrites(qc, noteId).length) return;
      const current = latest.current.read(); // null once the page stopped editing this note
      if (!current) return;
      const chain = state.current.chain ?? [];
      const version = contentVersion(doc);
      const plan = planServerDoc(chain, version, fingerprint(current.json) !== state.current.lastSaved);
      if (plan === "confirm") state.current.chain = chain.slice(chain.indexOf(version));
      else if (plan === "adopt") {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        editor.replace(doc);
        state.current = { ...state.current, persisted: true, lastSaved: fingerprint(editor.read().json), chain: [version] };
      }
    },
    [noteId, qc],
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

  // Save right away when the app goes to the background or the page closes: the request may
  // outlive the page, and the queue (with the note's syncPending flag) goes to disk now rather
  // than after the persister's throttle.
  useEffect(() => {
    const away = () => {
      save({ keepalive: true });
      void flushPersistedCache();
    };
    const onVisibility = () => document.visibilityState === "hidden" && away();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", away);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", away);
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

  return useMemo(
    () => ({
      changed,
      ready,
      flush,
      saveMeta,
      serverDoc,
      /** True once the server has (or will have) this note. */
      isPersisted: persisted,
    }),
    [changed, ready, flush, saveMeta, serverDoc, persisted],
  );
}
