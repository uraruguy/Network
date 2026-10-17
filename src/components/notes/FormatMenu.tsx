"use client";
import { useEditorState, type Editor } from "@tiptap/react";
import { Bold, Italic, Strikethrough, Underline } from "lucide-react";
import type { ReactNode } from "react";
import { setBlockStyle, type BlockStyle } from "@/lib/notes/extensions";
import { cn } from "@/lib/utils";

/** Everything the toolbars show as active, from one `useEditorState` selector. */
export function useFormatState(editor: Editor) {
  return useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      title: e.isActive("heading", { level: 1 }),
      heading: e.isActive("heading", { level: 2 }),
      subheading: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      task: e.isActive("taskList"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      focused: e.isFocused,
      empty: e.state.selection.empty,
    }),
  });
}
export type FormatState = ReturnType<typeof useFormatState>;

/** Keeps the editor focused (and its selection) when a toolbar control is pressed. */
export const keepFocus = { onPointerDown: (e: React.PointerEvent) => e.preventDefault(), onMouseDown: (e: React.MouseEvent) => e.preventDefault() };

const STYLES: { id: BlockStyle; label: string; shortcut: string; className: string }[] = [
  { id: "title", label: "Title", shortcut: "⇧⌘T", className: "text-title3 font-bold" },
  { id: "heading", label: "Heading", shortcut: "⇧⌘H", className: "text-headline font-bold" },
  { id: "subheading", label: "Subheading", shortcut: "⇧⌘J", className: "text-subhead font-semibold" },
  { id: "body", label: "Body", shortcut: "⇧⌘B", className: "text-subhead" },
];

export function activeBlockStyle(s: FormatState): BlockStyle {
  return s.title ? "title" : s.heading ? "heading" : s.subheading ? "subheading" : "body";
}

/**
 * Apple Notes "Aa" panel: paragraph styles + B I U S. `layout="dock"` is the horizontal strip
 * above the keyboard on phones; `layout="popover"` the desktop dropdown with shortcuts.
 */
export function FormatMenu({ editor, state, layout }: { editor: Editor; state: FormatState; layout: "dock" | "popover" }) {
  const current = activeBlockStyle(state);
  const marks: { id: "bold" | "italic" | "underline" | "strike"; label: string; icon: ReactNode; shortcut: string; run: () => void }[] = [
    { id: "bold", label: "Bold", icon: <Bold strokeWidth={2.6} />, shortcut: "⌘B", run: () => editor.chain().focus().toggleBold().run() },
    { id: "italic", label: "Italic", icon: <Italic strokeWidth={2.4} />, shortcut: "⌘I", run: () => editor.chain().focus().toggleItalic().run() },
    { id: "underline", label: "Underline", icon: <Underline strokeWidth={2.4} />, shortcut: "⌘U", run: () => editor.chain().focus().toggleUnderline().run() },
    { id: "strike", label: "Strikethrough", icon: <Strikethrough strokeWidth={2.4} />, shortcut: "⇧⌘X", run: () => editor.chain().focus().toggleStrike().run() },
  ];

  const styleButtons = STYLES.map((s) => (
    <button
      key={s.id}
      type="button"
      {...keepFocus}
      onClick={() => setBlockStyle(editor, s.id)}
      aria-pressed={current === s.id}
      className={cn(
        "pressable flex min-h-11 items-center gap-3 rounded-sm px-3 text-left whitespace-nowrap transition-colors duration-150",
        layout === "dock" ? "shrink-0 justify-center" : "w-full justify-between",
        current === s.id ? "bg-accent-soft text-accent-text" : "text-fg hover:bg-fill-1",
      )}
    >
      <span className={s.className}>{s.label}</span>
      {layout === "popover" && <kbd className="font-sans text-footnote text-fg-4">{s.shortcut}</kbd>}
    </button>
  ));

  const markButtons = (
    <div role="group" aria-label="Text style" className={cn("grid grid-cols-4 gap-1 rounded-sm bg-fill-1 p-1", layout === "dock" && "shrink-0")}>
      {marks.map((m) => (
        <button
          key={m.id}
          type="button"
          {...keepFocus}
          onClick={m.run}
          aria-label={m.label}
          aria-pressed={state[m.id]}
          title={layout === "popover" ? `${m.label} ${m.shortcut}` : undefined}
          className={cn(
            "pressable grid h-11 min-w-11 place-items-center rounded-xs transition-colors duration-150 [&_svg]:size-[18px]",
            state[m.id] ? "bg-segment-thumb text-accent-text shadow-e1" : "text-fg-2 hover:text-fg",
          )}
        >
          {m.icon}
        </button>
      ))}
    </div>
  );

  if (layout === "dock") {
    return (
      <div className="space-y-2 px-2 pt-2">
        <div role="group" aria-label="Paragraph style" className="no-scrollbar flex gap-1 overflow-x-auto">
          {styleButtons}
        </div>
        {markButtons}
      </div>
    );
  }
  return (
    <div className="w-[236px] space-y-2">
      <div role="group" aria-label="Paragraph style" className="space-y-0.5">
        {styleButtons}
      </div>
      {markButtons}
    </div>
  );
}
