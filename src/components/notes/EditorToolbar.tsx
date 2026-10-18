"use client";
import type { Editor } from "@tiptap/react";
import { ExternalLink, List, ListChecks, ListOrdered, TextQuote } from "lucide-react";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Popover } from "@/components/ui/Popover";
import { Tooltip, TooltipProvider } from "@/components/ui/Tooltip";
import { linkAt } from "@/lib/notes/extensions";
import { cn } from "@/lib/utils";
import { FormatMenu, keepFocus, useFormatState, type FormatState } from "./FormatMenu";
import { useKeyboardInset } from "./keyboard";

type Action = { id: string; label: string; icon: ReactNode; active: boolean; shortcut: string; run: () => void };

function listActions(editor: Editor, s: FormatState): Action[] {
  return [
    { id: "task", label: "Checklist", icon: <ListChecks />, active: s.task, shortcut: "⇧⌘L", run: () => editor.chain().focus().toggleTaskList().run() },
    { id: "bullet", label: "Bulleted list", icon: <List />, active: s.bullet, shortcut: "⇧⌘8", run: () => editor.chain().focus().toggleBulletList().run() },
    { id: "ordered", label: "Numbered list", icon: <ListOrdered />, active: s.ordered, shortcut: "⇧⌘7", run: () => editor.chain().focus().toggleOrderedList().run() },
    { id: "quote", label: "Block quote", icon: <TextQuote />, active: s.quote, shortcut: "", run: () => editor.chain().focus().toggleBlockquote().run() },
  ];
}

const toolButton =
  "pressable grid size-11 shrink-0 place-items-center rounded-full text-fg-2 transition-colors duration-150 hover:bg-fill-1 hover:text-fg aria-pressed:bg-accent-soft aria-pressed:text-accent-text [&_svg]:size-[20px]";

/**
 * Phone toolbar, docked right above the keyboard while the note is being edited:
 * [Aa] [☑] [•] [1.] [❝] … [Done]. "Aa" swaps in the format panel without hiding the keyboard.
 */
export function DockedToolbar({ editor }: { editor: Editor }) {
  const s = useFormatState(editor);
  const kb = useKeyboardInset(true);
  const [formatOpen, setFormatOpen] = useState(false);
  const visible = s.focused;
  const href = s.link ? linkAt(editor) : null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="toolbar"
      aria-label="Formatting"
      data-visible={visible || undefined}
      {...keepFocus}
      className={cn(
        "glass-thick specular fixed inset-x-2 z-[var(--z-chrome)] mx-auto max-w-[560px] rounded-xl pb-1.5 transition-[opacity,transform] duration-200 ease-out",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      )}
      style={{ bottom: kb > 0 ? `calc(${kb}px + 8px)` : "calc(var(--chrome-bottom) + 8px)" }}
    >
      {formatOpen && <FormatMenu editor={editor} state={s} layout="dock" />}
      <div className="flex items-center gap-0.5 px-1.5 pt-1.5">
        <button
          type="button"
          {...keepFocus}
          onClick={() => setFormatOpen((o) => !o)}
          aria-pressed={formatOpen}
          aria-label="Text formatting"
          className={cn(toolButton, "text-headline font-semibold")}
        >
          Aa
        </button>
        {listActions(editor, s).map((a) => (
          <button key={a.id} type="button" {...keepFocus} onClick={a.run} aria-pressed={a.active} aria-label={a.label} className={toolButton}>
            {a.icon}
          </button>
        ))}
        <span className="flex-1" />
        {href && (
          <button type="button" {...keepFocus} onClick={() => window.open(href, "_blank", "noopener,noreferrer")} aria-label="Open link" className={toolButton}>
            <ExternalLink />
          </button>
        )}
        <button
          type="button"
          {...keepFocus}
          onClick={() => {
            setFormatOpen(false);
            editor.commands.blur();
          }}
          className="pressable h-11 shrink-0 rounded-full px-3.5 text-headline text-accent-text hover:bg-accent-soft"
        >
          Done
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** Desktop toolbar in the note's navigation bar: [Aa ▾] [☑] [•] [1.] [❝]. */
export function InlineToolbar({ editor }: { editor: Editor }) {
  const s = useFormatState(editor);
  return (
    <TooltipProvider delay={400}>
      <div role="toolbar" aria-label="Formatting" className="flex items-center gap-0.5" {...keepFocus}>
        <Popover
          side="bottom"
          align="start"
          title="Text formatting"
          initialFocus={false}
          className="p-2"
          trigger={
            <button type="button" aria-label="Text formatting" className={cn(toolButton, "w-auto px-3 text-headline font-semibold")} {...keepFocus}>
              Aa
            </button>
          }
        >
          <FormatMenu editor={editor} state={s} layout="popover" />
        </Popover>
        {listActions(editor, s).map((a) => (
          <Tooltip key={a.id} content={a.label} shortcut={a.shortcut || undefined}>
            <button type="button" {...keepFocus} onClick={a.run} aria-pressed={a.active} aria-label={a.label} className={toolButton}>
              {a.icon}
            </button>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
