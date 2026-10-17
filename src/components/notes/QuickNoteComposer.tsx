"use client";
import { useQueryClient } from "@tanstack/react-query";
import { Maximize2, SquarePen } from "lucide-react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { IconButton } from "@/components/ui/IconButton";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { Tooltip } from "@/components/ui/Tooltip";
import type { NoteKind } from "@/lib/constants";
import { plainTextToMarkdown } from "@/lib/notes/paste";
import { titleFromText } from "@/lib/notes/title";
import { saveNote, useNewNote } from "@/lib/queries/notes";
import { cn } from "@/lib/utils";
import { keepFocus } from "./FormatMenu";
import { primeKeyboard } from "./keyboard";
import { KIND_ITEMS, KIND_META } from "./kinds";
import { preloadNoteEditor } from "./loadEditor";

const MAX_HEIGHT = 320;
const storageKey = (personId: string) => `note-composer:${personId}`;

function readDraft(personId: string): string {
  try {
    return sessionStorage.getItem(storageKey(personId)) ?? "";
  } catch {
    return "";
  }
}
function writeDraft(personId: string, text: string) {
  try {
    if (text) sessionStorage.setItem(storageKey(personId), text);
    else sessionStorage.removeItem(storageKey(personId));
  } catch {}
}

/**
 * "New note…" on the person page: a one-line field that grows as you type. ⌘↩ (or Save) files
 * the note instantly — offline too; ⤢ continues in the full editor with what you typed.
 */
export function QuickNoteComposer({ personId, personName, className }: { personId: string; personName: string; className?: string }) {
  const qc = useQueryClient();
  const newNote = useNewNote();
  const ref = useRef<HTMLTextAreaElement>(null);
  // An unsent draft for this person survives navigating away and back (page bodies render client-side only).
  const [text, setText] = useState(() => readDraft(personId));
  const [kind, setKind] = useState<NoteKind>("note");
  const [focused, setFocused] = useState(false);
  const expanded = focused || !!text;
  const firstName = personName.split(/\s+/)[0] || personName;

  // Grow with the text (CSS field-sizing isn't everywhere yet).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  }, [text, expanded]);

  const update = (value: string) => {
    setText(value);
    writeDraft(personId, value);
  };

  const reset = () => {
    update("");
    setKind("note");
  };

  const save = () => {
    const t = text.trim();
    if (!t) return;
    saveNote(
      qc,
      crypto.randomUUID(),
      { personId, title: titleFromText(t), contentJson: null, contentMd: plainTextToMarkdown(t), contentText: t, kind, occurredAt: new Date().toISOString() },
      { isNew: true, sync: true },
    );
    reset();
    ref.current?.blur();
  };

  const openInEditor = () => {
    primeKeyboard();
    const t = text.trim();
    newNote(personId, t ? { kind, title: titleFromText(t), contentMd: plainTextToMarkdown(t), contentText: t } : { kind });
    reset();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      ref.current?.blur();
    }
  };

  return (
    <div
      className={cn(
        "surface rounded-lg transition-[box-shadow,border-color] duration-200",
        focused && "elevation-e3 border-accent",
        className,
      )}
      onPointerEnter={preloadNoteEditor}
    >
      <div className="flex items-start gap-3 px-4">
        <SquarePen size={20} aria-hidden className={cn("mt-3 shrink-0 transition-colors", expanded ? "text-accent-text" : "text-fg-4")} />
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => update(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          placeholder={expanded ? `What did you talk about with ${firstName}?` : "New note…"}
          aria-label={`New note about ${personName}`}
          enterKeyHint="enter"
          autoCapitalize="sentences"
          className="block min-h-12 w-full resize-none bg-transparent py-3 text-body text-fg outline-none placeholder:text-fg-3"
        />
      </div>
      {expanded && (
        <div className="flex flex-wrap items-center gap-2 border-t-[0.5px] border-separator px-3 py-2" {...keepFocus}>
          <div role="group" aria-label="Type" className="flex shrink-0 flex-wrap gap-1.5 py-1">
            {KIND_ITEMS.map((k) => (
              <ToggleChip
                key={k.value}
                pressed={kind === k.value}
                onPressedChange={() => setKind(k.value)}
                icon={KIND_META[k.value].icon(13)}
                size="sm"
              >
                {k.label}
              </ToggleChip>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Tooltip content="Open in editor">
              <IconButton label="Open in editor" variant="plain" icon={<Maximize2 />} onPointerDown={preloadNoteEditor} onClick={openInEditor} />
            </Tooltip>
            <Tooltip content="Save" shortcut="⌘↩">
              <GlassButton variant="primary" size="sm" disabled={!text.trim()} onClick={save}>
                Save
              </GlassButton>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  );
}
