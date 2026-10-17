/**
 * Editor document helpers (pure JSON, no Tiptap runtime).
 */
import type { JSONContent } from "@tiptap/react";

/** A new note: an empty Title line and an empty body line ("Title" / "Note" placeholders). */
export function emptyNoteDoc(): JSONContent {
  return { type: "doc", content: [{ type: "heading", attrs: { level: 1 } }, { type: "paragraph" }] };
}

const isEmptyParagraph = (n: JSONContent | undefined) => n?.type === "paragraph" && !n.content?.length;

/**
 * Markdown paragraphs are separated by a blank line; in the editor (Apple Notes' line model)
 * that blank line is an empty paragraph. Inserting them when a note is first opened from
 * Markdown keeps imported and quick-composed notes looking the way they were written.
 */
export function spaceParagraphs(doc: JSONContent): JSONContent {
  const content = doc.content ?? [];
  const out: JSONContent[] = [];
  content.forEach((node, i) => {
    const prev = content[i - 1];
    if (prev && node.type === "paragraph" && prev.type === "paragraph" && !isEmptyParagraph(node) && !isEmptyParagraph(prev)) out.push({ type: "paragraph" });
    out.push(node);
  });
  return { ...doc, content: out };
}

/** True when the document holds no text at all. */
export function isDocEmpty(doc: JSONContent | null | undefined): boolean {
  const walk = (n: JSONContent): boolean => (n.type === "text" ? !n.text?.trim() : (n.content ?? []).every(walk));
  return !doc || walk(doc);
}
