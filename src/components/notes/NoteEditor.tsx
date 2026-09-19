"use client";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Typography } from "@tiptap/extension-typography";
import { Markdown } from "@tiptap/markdown";
import { Bold, CheckSquare, Heading2, Italic, List, ListOrdered, Quote } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type NoteContent = { json: unknown; md: string; text: string; title: string | null };

type Props = {
  initialJson: unknown | null;
  initialMd?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onChange: (c: NoteContent) => void;
  className?: string;
};

function extract(editor: Editor): NoteContent {
  const json = editor.getJSON();
  const md = editor.getMarkdown();
  const text = editor.getText({ blockSeparator: "\n" });
  const first = json.content?.[0];
  const title = first?.type === "heading" ? (editor.state.doc.firstChild?.textContent.trim() ?? null) : null;
  return { json, md, text, title: title || null };
}

export function NoteEditor({ initialJson, initialMd, placeholder = "Write freely. First line as a heading becomes the title.", autoFocus, onChange, className }: Props) {
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    autofocus: autoFocus ? "end" : false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: true, autolink: true, defaultProtocol: "https" },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
      Typography,
      Markdown,
    ],
    content: (initialJson as Record<string, unknown> | null) ?? initialMd ?? "",
    contentType: initialJson ? "json" : "markdown",
    editorProps: { attributes: { class: "tiptap", spellcheck: "true" } },
    onUpdate: ({ editor }) => latest.current(extract(editor)),
  });

  // iOS: keep the caret visible above the keyboard by scrolling the focused block into view.
  useEffect(() => {
    if (!editor) return;
    const onSel = () => {
      const { from } = editor.state.selection;
      const dom = editor.view.domAtPos(from).node as HTMLElement | Text;
      const el = dom instanceof Text ? dom.parentElement : dom;
      el?.scrollIntoView?.({ block: "nearest" });
    };
    editor.on("selectionUpdate", onSel);
    return () => {
      editor.off("selectionUpdate", onSel);
    };
  }, [editor]);

  return (
    <div className={cn("relative", className)}>
      <EditorContent editor={editor} />
      {editor && <Toolbar editor={editor} />}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const btn = (label: string, Icon: React.ComponentType<{ size?: number }>, run: () => void) => (
    <button type="button" aria-label={label} onMouseDown={(e) => { e.preventDefault(); run(); }} className="pressable grid h-9 w-9 place-items-center rounded-full text-fg-2 hover:bg-fg/6 active:bg-accent-soft">
      <Icon size={17} />
    </button>
  );
  return (
    <div className="glass-strong specular sticky bottom-[calc(76px+var(--sab))] lg:bottom-4 mt-4 flex w-fit items-center gap-0.5 rounded-full px-1.5 py-1 mx-auto">
      {btn("Heading", Heading2, () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
      {btn("Bold", Bold, () => editor.chain().focus().toggleBold().run())}
      {btn("Italic", Italic, () => editor.chain().focus().toggleItalic().run())}
      <span className="mx-0.5 h-5 w-px bg-fg/10" />
      {btn("Bullet list", List, () => editor.chain().focus().toggleBulletList().run())}
      {btn("Numbered list", ListOrdered, () => editor.chain().focus().toggleOrderedList().run())}
      {btn("Checklist", CheckSquare, () => editor.chain().focus().toggleTaskList().run())}
      {btn("Quote", Quote, () => editor.chain().focus().toggleBlockquote().run())}
    </div>
  );
}
