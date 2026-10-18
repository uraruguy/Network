"use client";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { NodeSelection } from "@tiptap/pm/state";
import { Bold, Italic, Link2, Strikethrough, Underline } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "@/components/ui/Toast";
import { useCoarsePointer } from "@/lib/media";
import type { NoteDoc } from "@/lib/notes/cache";
import { emptyNoteDoc, spaceParagraphs } from "@/lib/notes/doc";
import { noteExtensions, type NoteEditorHooks } from "@/lib/notes/extensions";
import { noteText } from "@/lib/notes/text";
import { titleFromDoc } from "@/lib/notes/title";
import type { NoteContent } from "@/lib/notes/useNoteAutosave";
import { cn } from "@/lib/utils";
import { DockedToolbar, InlineToolbar } from "./EditorToolbar";
import { keepFocus, useFormatState } from "./FormatMenu";
import { isKeyboardPrimed, releaseKeyboardPrime } from "./keyboard";
import { LinkSheet } from "./LinkSheet";
import "./editor.css";

export type { NoteContent } from "@/lib/notes/useNoteAutosave";

type EditorNote = Pick<NoteDoc, "contentJson" | "contentMd"> & Partial<Pick<NoteDoc, "contentText" | "localOnly" | "baseVersions">>;

export type NoteEditorApi = {
  editor: Editor;
  /** Current content (JSON, Markdown, plain text, derived title). */
  read: () => NoteContent;
  focus: () => void;
  /** Replaces the whole document (a fresher server copy) without an update event or undo step. */
  replace: (note: Pick<NoteDoc, "contentJson" | "contentMd">) => void;
  isDestroyed: () => boolean;
  /** The note the editor was created from (its version is what the first save is based on). */
  source: EditorNote;
};

/** Editor content for a note: `contentJson`, else `contentMd` (Markdown), else an empty Title line. */
function initialContent(note: Pick<NoteDoc, "contentJson" | "contentMd">) {
  if (note.contentJson) return { content: note.contentJson as Record<string, unknown>, type: "json" as const };
  if (note.contentMd?.trim()) return { content: note.contentMd, type: "markdown" as const };
  return { content: emptyNoteDoc() as Record<string, unknown>, type: "json" as const };
}

export type NoteEditorProps = {
  /** Initial content: `contentJson`, else `contentMd` (Markdown), else an empty Title line. */
  note: EditorNote;
  /** Put the caret in the note right away (new notes). */
  autoFocus?: boolean;
  /** Called once with the editor and its initial content in place. */
  onReady?: (api: NoteEditorApi) => void;
  /** Called after every document change. */
  onChange?: () => void;
  /** Desktop toolbar target (the note page's navigation bar). */
  toolbarSlot?: HTMLElement | null;
  editable?: boolean;
  className?: string;
};

const imagesDroppedToast = (n: number) =>
  toast({ title: "Pasted text only", description: n === 1 ? "The image was left out." : `${n} images were left out.` });

export function readContent(editor: Editor): NoteContent {
  const json = editor.getJSON();
  // noteText, not editor.getText(): one line per textblock, no blank lines from list wrappers.
  return { json, md: editor.getMarkdown(), text: noteText(json), title: titleFromDoc(json) };
}

/** Swaps in another version of the note — not an edit: no update event, no undo step. */
function replaceContent(editor: Editor, note: Pick<NoteDoc, "contentJson" | "contentMd">) {
  const next = initialContent(note);
  editor.chain().setMeta("addToHistory", false).setContent(next.content, { emitUpdate: false, contentType: next.type }).run();
  if (next.type === "markdown") editor.chain().setMeta("addToHistory", false).setContent(spaceParagraphs(editor.getJSON()), { emitUpdate: false }).run();
}

/**
 * The Apple Notes–style editor: Title/Heading/Subheading/Body, checklists, lists, quotes, links,
 * clean paste. Phone: toolbar docked above the keyboard. Desktop: toolbar in the nav bar plus a
 * bubble menu (B I U S Link) on selection. Content is uncontrolled after mount.
 */
export function NoteEditor({ note, autoFocus, onReady, onChange, toolbarSlot, editable = true, className }: NoteEditorProps) {
  const coarse = useCoarsePointer();
  const [linkOpen, setLinkOpen] = useState(false);
  const callbacks = useRef({ onReady, onChange });
  useEffect(() => {
    callbacks.current = { onReady, onChange };
  });

  // Initial content is read once; the editor owns the document afterwards (see `replace`).
  const [source] = useState(note);
  const [initial] = useState(() => initialContent(note));
  const [extensions] = useState(() => {
    const hooks: NoteEditorHooks = { onLink: () => setLinkOpen(true), onImagesDropped: imagesDroppedToast };
    return noteExtensions(() => hooks);
  });

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editable,
    extensions,
    content: initial.content,
    contentType: initial.type,
    autofocus: autoFocus ? (initial.type === "markdown" ? "end" : "start") : false,
    editorProps: {
      attributes: {
        class: "tiptap note-prose",
        spellcheck: "true",
        autocapitalize: "sentences",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Note",
      },
    },
    onCreate: ({ editor }) => {
      // Markdown paragraphs → Apple Notes lines with blank lines between (see spaceParagraphs).
      if (initial.type === "markdown") {
        const spaced = spaceParagraphs(editor.getJSON());
        editor.chain().setMeta("addToHistory", false).setContent(spaced, { emitUpdate: false }).run();
        if (autoFocus) editor.commands.focus("end");
      }
      callbacks.current.onReady?.({
        editor,
        read: () => readContent(editor),
        focus: () => editor.commands.focus(),
        replace: (next) => replaceContent(editor, next),
        isDestroyed: () => editor.isDestroyed,
        source,
      });
    },
    onUpdate: () => callbacks.current.onChange?.(),
    onFocus: () => isKeyboardPrimed() && releaseKeyboardPrime(),
  });

  // A primed iOS keyboard (see primeKeyboard) hands over to the editor once it exists.
  useEffect(() => {
    if (editor && autoFocus && isKeyboardPrimed()) editor.commands.focus(initial.type === "markdown" ? "end" : "start");
  }, [editor, autoFocus, initial.type]);

  // iOS: keep the caret visible above the keyboard.
  useEffect(() => {
    if (!editor) return;
    const onSelection = () => {
      if (!editor.isFocused) return;
      const { from } = editor.state.selection;
      const at = editor.view.domAtPos(from).node;
      const el = at instanceof Text ? at.parentElement : (at as HTMLElement);
      el?.scrollIntoView?.({ block: "nearest" });
    };
    editor.on("selectionUpdate", onSelection);
    return () => {
      editor.off("selectionUpdate", onSelection);
    };
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  return (
    <div className={cn("relative", className)}>
      <EditorContent editor={editor} />
      {editor && editable && (
        <>
          {coarse ? <DockedToolbar editor={editor} /> : toolbarSlot && createPortal(<InlineToolbar editor={editor} />, toolbarSlot)}
          {!coarse && <SelectionBubble editor={editor} onLink={() => setLinkOpen(true)} hidden={linkOpen} />}
          <LinkSheet editor={editor} open={linkOpen} onOpenChange={setLinkOpen} />
        </>
      )}
    </div>
  );
}

const bubbleButton =
  "pressable grid size-9 place-items-center rounded-full text-fg-2 transition-colors duration-150 hover:bg-fill-2 hover:text-fg aria-pressed:bg-accent-soft aria-pressed:text-accent-text [&_svg]:size-[17px]";

/** Desktop selection menu: B I U S · Link. */
function SelectionBubble({ editor, onLink, hidden }: { editor: Editor; onLink: () => void; hidden: boolean }) {
  const s = useFormatState(editor);
  const items = [
    { label: "Bold", icon: <Bold strokeWidth={2.6} />, active: s.bold, run: () => editor.chain().focus().toggleBold().run() },
    { label: "Italic", icon: <Italic strokeWidth={2.4} />, active: s.italic, run: () => editor.chain().focus().toggleItalic().run() },
    { label: "Underline", icon: <Underline strokeWidth={2.4} />, active: s.underline, run: () => editor.chain().focus().toggleUnderline().run() },
    { label: "Strikethrough", icon: <Strikethrough strokeWidth={2.4} />, active: s.strike, run: () => editor.chain().focus().toggleStrike().run() },
  ];
  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 8, flip: true, shift: { padding: 8 } }}
      shouldShow={({ editor: e, state, from, to }) => !hidden && e.isFocused && from !== to && !(state.selection instanceof NodeSelection) && !e.isActive("codeBlock")}
      className="z-[var(--z-chrome)]"
    >
      <div role="toolbar" aria-label="Selection formatting" {...keepFocus} className="glass-thick specular elevation-e3 flex items-center gap-0.5 rounded-full p-1">
        {items.map((i) => (
          <button key={i.label} type="button" aria-label={i.label} aria-pressed={i.active} onClick={i.run} className={bubbleButton}>
            {i.icon}
          </button>
        ))}
        <span aria-hidden className="mx-0.5 h-5 w-[0.5px] bg-separator" />
        <button type="button" aria-label="Link" aria-pressed={s.link} onClick={onLink} className={bubbleButton}>
          <Link2 />
        </button>
      </div>
    </BubbleMenu>
  );
}
