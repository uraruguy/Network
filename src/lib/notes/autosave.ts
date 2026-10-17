/**
 * Autosave decisions (pure): when to write a note and what to do when the user leaves it.
 * Used by useNoteAutosave; unit-tested in autosave.test.ts.
 */
import type { JSONContent } from "@tiptap/react";
import { isBlankContent } from "./title";

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

