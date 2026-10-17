"use client";
/**
 * The editor (Tiptap + ProseMirror) is its own chunk. Pages that lead to it preload it on idle
 * and on pointerdown of "New note", so the editor renders instantly when the note opens.
 */
import { useEffect, useState } from "react";

type EditorModule = typeof import("./NoteEditor");

let loaded: EditorModule | null = null;
let loading: Promise<EditorModule> | null = null;

export function loadNoteEditor(): Promise<EditorModule> {
  loading ??= import("./NoteEditor").then(
    (m) => (loaded = m),
    (e) => {
      loading = null;
      throw e;
    },
  );
  return loading;
}

/** Fire-and-forget preload. */
export function preloadNoteEditor() {
  loadNoteEditor().catch(() => {});
}

/** Preloads the editor when the browser is idle. */
export function usePreloadNoteEditorOnIdle() {
  useEffect(() => {
    if (loaded) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(preloadNoteEditor, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(preloadNoteEditor, 1500);
    return () => clearTimeout(t);
  }, []);
}

/** The editor module — synchronously when already preloaded, otherwise once it arrives. */
export function useNoteEditorModule(): EditorModule | null {
  const [mod, setMod] = useState<EditorModule | null>(() => loaded);
  useEffect(() => {
    if (mod) return;
    let alive = true;
    loadNoteEditor().then((m) => alive && setMod(m), () => {});
    return () => {
      alive = false;
    };
  }, [mod]);
  return mod;
}
