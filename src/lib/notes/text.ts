/**
 * Plain text of a note: what search, list excerpts, the AI and the "is this note empty?" check
 * read. Pure (JSON in, string out) so it runs in the editor, on the server and in tests.
 *
 * One line per textblock (paragraph, heading, code block), hard breaks as line breaks. Wrappers
 * — lists, list/task items, quotes — add no lines of their own, so a checklist item followed by a
 * heading never runs together and nesting never leaves phantom blank lines (Tiptap's
 * `getText({ blockSeparator })` emits one separator per block *boundary*, wrappers included).
 * Empty paragraphs stay as blank lines: in Apple Notes' line model they're deliberate.
 */
import type { JSONContent } from "@tiptap/react";

/** Node types that hold inline content. Others are recognised by having inline children. */
const TEXTBLOCKS = new Set(["paragraph", "heading", "codeBlock"]);
const INLINE_TEXT: Record<string, string> = { hardBreak: "\n" };

const isInline = (n: JSONContent) => n.type === "text" || (n.type !== undefined && n.type in INLINE_TEXT);
const isTextblock = (n: JSONContent) => (n.type !== undefined && TEXTBLOCKS.has(n.type)) || !!n.content?.some(isInline);

function inlineText(n: JSONContent): string {
  if (n.type === "text") return n.text ?? "";
  if (n.type && n.type in INLINE_TEXT) return INLINE_TEXT[n.type]!;
  return (n.content ?? []).map(inlineText).join("");
}

function lines(node: JSONContent, out: string[]): string[] {
  if (isTextblock(node)) out.push(inlineText(node));
  else for (const child of node.content ?? []) lines(child, out);
  return out;
}

/** Text of any node (a block, a list, a whole document), one textblock per line. */
export function nodeText(node: JSONContent | null | undefined): string {
  return node ? lines(node, []).join("\n") : "";
}

/** The note's plain text (stored as `contentText`): `nodeText` without trailing blank lines. */
export function noteText(doc: JSONContent | null | undefined): string {
  return nodeText(doc).replace(/\s+$/, "");
}
