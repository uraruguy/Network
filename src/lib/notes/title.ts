/**
 * Note titles, Apple Notes style: the title is the first line of the note (the first block with
 * any text), never a separate field the user has to fill in. "New note" is only a display
 * fallback and is never persisted. Pure (no DOM, no Tiptap runtime) so it runs in tests and on
 * the server.
 */
import type { JSONContent } from "@tiptap/react";
import { nodeText } from "./text";

/** Plain text of a JSON node, one textblock per line (see ./text). */
export { nodeText };

/** Display fallback for a note without any text. Never written to the database. */
export const NEW_NOTE_TITLE = "New note";

/** Titles longer than this are cut (the full line stays in the body). */
export const TITLE_MAX = 200;

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

function cap(s: string): string {
  if (s.length <= TITLE_MAX) return s;
  const cut = s.slice(0, TITLE_MAX);
  const space = cut.lastIndexOf(" ");
  return (space > TITLE_MAX * 0.6 ? cut.slice(0, space) : cut).trimEnd() + "…";
}

/** First non-empty line of a string. */
export function firstLine(s: string | null | undefined): string {
  if (!s) return "";
  for (const line of s.split(/\r?\n/)) {
    const t = collapse(line);
    if (t) return t;
  }
  return "";
}

/**
 * Title from an editor document: the first line of the first block that has text (a heading,
 * paragraph, list item, quote…). Null for an empty note.
 */
export function titleFromDoc(doc: JSONContent | null | undefined): string | null {
  for (const block of doc?.content ?? []) {
    const line = firstLine(nodeText(block));
    if (line) return cap(line);
  }
  return null;
}

const MD_PREFIX = /^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+•]\s+(?:\[[ xX]\]\s+)?|\d{1,3}[.)]\s+|[☐☑✓✔◦✅☒]\s*)/;

/** One line of plain text or markdown without list/heading/checkbox markers or bold wrappers. */
function plainLine(raw: string): string {
  return collapse(
    raw
      .replace(MD_PREFIX, "")
      .replace(/^(\*\*|__)(.+)\1$/, "$2")
      .replace(/^(\*|_)(.+)\1$/, "$2"),
  );
}

/** A line worth showing: it has at least one letter or digit (not "---", "•", "☐"). */
const meaningful = (line: string) => /[\p{L}\p{N}]/u.test(line);

/** Title from plain text or markdown: first non-empty line without list/heading markers. */
export function titleFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const raw of text.split(/\r?\n/)) {
    const line = plainLine(raw);
    if (line) return cap(line);
  }
  return null;
}

/** True when a note has no words at all (title and body empty). Such notes are never kept. */
export function isBlankContent(c: { title?: string | null; contentText?: string | null }): boolean {
  return !c.title?.trim() && !c.contentText?.trim();
}

type TitleSource = { title?: string | null; excerpt?: string | null; contentText?: string | null };

/** The title to show: stored title, else the first line of the text (markers stripped), else "New note". */
export function displayTitle(note: TitleSource): string {
  return note.title?.trim() || titleFromText(note.excerpt ?? note.contentText) || NEW_NOTE_TITLE;
}

/**
 * The line to show under the title in a list ("14:32 · <this>"): the first meaningful line after
 * the title. Blank and marker-only lines are skipped and list/heading/checkbox markers stripped;
 * when the text doesn't start with the title (imports keep a separate title) the first line is
 * the snippet. Empty when the note is only a title.
 */
export function noteSnippet(note: TitleSource, max = 140): string {
  const text = note.excerpt ?? note.contentText ?? "";
  const title = collapse(note.title ?? "").replace(/…$/, "");
  const lines = text.split(/\r?\n/).map(plainLine).filter(meaningful);
  const first = lines[0];
  const skipTitle = first !== undefined && (!title || first === title || first.startsWith(title));
  const line = lines[skipTitle ? 1 : 0] ?? "";
  return line.length > max ? line.slice(0, max).trimEnd() + "…" : line;
}
