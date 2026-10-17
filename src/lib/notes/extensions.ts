/**
 * The note editor's Tiptap setup: StarterKit (headings 1–3, lists, quote, code, link, underline,
 * strike), checklists, Apple Notes placeholders ("Title" / "Note"), gentle typography, Markdown
 * I/O, Apple Notes keyboard shortcuts and clean paste.
 *
 * Callbacks reach React through a ref (`hooks.current`) because extensions are created once.
 */
import { Extension, type AnyExtension, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Typography } from "@tiptap/extension-typography";
import { Markdown } from "@tiptap/markdown";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { cleanPastedHtml, htmlIsPlainish, looksLikeMarkdown } from "./paste";

export type NoteEditorHooks = {
  /** ⌘K: open the link editor. */
  onLink?: () => void;
  /** Images (or files) were left out of a paste/drop. */
  onImagesDropped?: (count: number) => void;
};

export type HooksRef = { current: NoteEditorHooks };

/** Paragraph-level styles in Apple Notes' vocabulary. */
export type BlockStyle = "title" | "heading" | "subheading" | "body";

export function setBlockStyle(editor: Editor, style: BlockStyle) {
  const chain = editor.chain().focus();
  if (style === "body") return chain.setParagraph().run();
  return chain.setHeading({ level: style === "title" ? 1 : style === "heading" ? 2 : 3 }).run();
}

/** Toggles the checked state of the checklist item(s) in the selection (⌘⇧U). */
export function toggleChecked(editor: Editor): boolean {
  return editor.commands.command(({ tr, state }) => {
    const { from, to } = state.selection;
    const items: { pos: number; checked: boolean }[] = [];
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name === "taskItem") items.push({ pos, checked: !!node.attrs.checked });
    });
    if (!items.length) {
      const $from = state.selection.$from;
      for (let d = $from.depth; d > 0; d--) {
        const node = $from.node(d);
        if (node.type.name === "taskItem") {
          items.push({ pos: $from.before(d), checked: !!node.attrs.checked });
          break;
        }
      }
    }
    if (!items.length) return false;
    const target = !items.every((i) => i.checked);
    for (const i of items) tr.setNodeAttribute(i.pos, "checked", target);
    return true;
  });
}

/** The link under the cursor (or selection start), if any. */
export function linkAt(editor: Editor): string | null {
  return (editor.getAttributes("link").href as string | undefined) ?? null;
}

const AppleNotesKeys = (hooks: HooksRef) =>
  Extension.create({
    name: "appleNotesKeys",
    // Before StarterKit's own bindings (⌘⇧B is Blockquote there; here it is Body, as in Notes).
    priority: 1000,
    addKeyboardShortcuts() {
      return {
        "Mod-Shift-t": () => setBlockStyle(this.editor, "title"),
        "Mod-Shift-h": () => setBlockStyle(this.editor, "heading"),
        "Mod-Shift-j": () => setBlockStyle(this.editor, "subheading"),
        "Mod-Shift-b": () => setBlockStyle(this.editor, "body"),
        "Mod-Shift-l": () => this.editor.chain().focus().toggleTaskList().run(),
        "Mod-Shift-u": () => toggleChecked(this.editor),
        "Mod-k": () => {
          hooks.current.onLink?.();
          return true;
        },
        Escape: () => {
          this.editor.commands.blur();
          return true;
        },
      };
    },
  });

const hasFiles = (dt: DataTransfer | null) => !!dt && Array.from(dt.types ?? []).includes("Files");

const NotePaste = (hooks: HooksRef) =>
  Extension.create({
    name: "notePaste",
    addProseMirrorPlugins() {
      const editor = this.editor;
      return [
        new Plugin({
          key: new PluginKey("notePaste"),
          props: {
            transformPastedHTML(html) {
              const r = cleanPastedHtml(html);
              if (r.images) hooks.current.onImagesDropped?.(r.images);
              return r.html;
            },
            handlePaste(_view, event) {
              const dt = event.clipboardData;
              if (!dt) return false;
              const html = dt.getData("text/html");
              const text = dt.getData("text/plain");
              if (!html && !text && hasFiles(dt)) {
                hooks.current.onImagesDropped?.(dt.files.length || 1);
                return true;
              }
              if (text && looksLikeMarkdown(text) && (!html || htmlIsPlainish(html))) {
                editor.commands.insertContent(text, { contentType: "markdown" });
                return true;
              }
              return false;
            },
            handleDrop(_view, event) {
              const dt = (event as DragEvent).dataTransfer;
              if (dt?.files?.length) {
                hooks.current.onImagesDropped?.(dt.files.length);
                return true;
              }
              return false;
            },
            // ⌘/Ctrl-click opens a link (plain clicks just place the caret while editing).
            handleClick(view, pos, event) {
              if (!(event.metaKey || event.ctrlKey)) return false;
              const $pos = view.state.doc.resolve(pos);
              const link = $pos.marks().find((m) => m.type.name === "link") ?? $pos.nodeAfter?.marks.find((m) => m.type.name === "link");
              const href = link?.attrs.href as string | undefined;
              if (!href) return false;
              window.open(href, "_blank", "noopener,noreferrer");
              return true;
            },
          },
        }),
      ];
    },
  });

export function noteExtensions(hooks: HooksRef): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        isAllowedUri: (url, ctx) => ctx.defaultValidate(url) && !/^\s*(javascript|data|vbscript|file):/i.test(url),
      },
      codeBlock: { HTMLAttributes: { spellcheck: "false" } },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({
      showOnlyCurrent: false,
      includeChildren: false,
      placeholder: ({ editor, node, pos }) => {
        if (pos === 0) return "Title";
        return editor.state.doc.childCount <= 2 && node.type.name === "paragraph" ? "Note" : "";
      },
    }),
    Typography.configure({
      copyright: false,
      trademark: false,
      servicemark: false,
      registeredTrademark: false,
      oneHalf: false,
      oneQuarter: false,
      threeQuarters: false,
      plusMinus: false,
      notEqual: false,
      laquo: false,
      raquo: false,
      multiplication: false,
      superscriptTwo: false,
      superscriptThree: false,
    }),
    Markdown,
    AppleNotesKeys(hooks),
    NotePaste(hooks),
  ];
}
