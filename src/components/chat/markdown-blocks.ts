/**
 * Splits streaming markdown into top-level blocks, so a renderer can memoise each block and only
 * re-parse the last one while tokens arrive. Pure; unit-tested.
 *
 * - A blank line ends a block, except inside fenced code (``` or ~~~).
 * - List items separated by blank lines stay one block (one list, numbering intact), and so do
 *   indented continuation paragraphs of a list item.
 */

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const LIST_ITEM = /^\s{0,3}(?:[-*+]|\d{1,9}[.)])\s/;
const INDENTED = /^(?: {2,}|\t)\S/;

export function splitMarkdownBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;

  const flush = () => {
    if (!current.length) return;
    const text = current.join("\n");
    current = [];
    const prev = blocks[blocks.length - 1];
    const continuesList = prev !== undefined && LIST_ITEM.test(prev.split("\n")[0]!) && (LIST_ITEM.test(text) || INDENTED.test(text));
    if (continuesList) blocks[blocks.length - 1] = `${prev}\n\n${text}`;
    else blocks.push(text);
  };

  for (const line of markdown.split("\n")) {
    const f = FENCE.exec(line);
    if (fence) {
      current.push(line);
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length && line.trim() === f[1]) fence = null;
      continue;
    }
    if (f) {
      fence = f[1]!;
      current.push(line);
      continue;
    }
    if (line.trim() === "") flush();
    else current.push(line);
  }
  flush();
  return blocks;
}
