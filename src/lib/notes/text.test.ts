// @vitest-environment happy-dom
import { Editor, type JSONContent } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import { noteExtensions } from "./extensions";
import { noteText } from "./text";
import { noteSnippet } from "./title";

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((e) => e.destroy()));

/** The editor's own document for some content (exactly what NoteEditor saves). */
function docOf(content: JSONContent | string, contentType?: "markdown"): JSONContent {
  const editor = new Editor({ extensions: noteExtensions(() => ({})), content, ...(contentType ? { contentType } : {}) });
  editors.push(editor);
  return editor.getJSON();
}

const p = (text?: string): JSONContent => ({ type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}) });
const h = (level: number, text: string): JSONContent => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });
const task = (text: string, checked = false, ...more: JSONContent[]): JSONContent => ({ type: "taskItem", attrs: { checked }, content: [p(text), ...more] });
const tasks = (...items: JSONContent[]): JSONContent => ({ type: "taskList", content: items });
const bullets = (...items: string[]): JSONContent => ({ type: "bulletList", content: items.map((t) => ({ type: "listItem", content: [p(t)] })) });

describe("noteText", () => {
  it("puts a checklist item and the heading after it on separate lines", () => {
    const doc = docOf({ type: "doc", content: [h(1, "Lisbon trip"), tasks(task("send him the flat link")), h(2, "Dinner plans"), p("Book the table")] });
    expect(noteText(doc)).toBe("Lisbon trip\nsend him the flat link\nDinner plans\nBook the table");
  });

  it("gives every list item its own line, followed by headings and paragraphs", () => {
    const doc = docOf({
      type: "doc",
      content: [p("Groceries"), bullets("milk", "eggs"), h(3, "Later"), tasks(task("Call Ana"), task("Paid", true)), p("Done.")],
    });
    expect(noteText(doc).split("\n")).toEqual(["Groceries", "milk", "eggs", "Later", "Call Ana", "Paid", "Done."]);
  });

  it("does not add blank lines for list/item wrappers when a note starts with a checklist", () => {
    const doc = docOf("- [ ] send him the flat link\n## Dinner plans\nok", "markdown");
    expect(noteText(doc)).toBe("send him the flat link\nDinner plans\nok");
  });

  it("handles blocks nested inside a checklist item (headings, lists, blank lines)", () => {
    const doc = docOf({
      type: "doc",
      content: [p("Quick call"), tasks(task("send him the flat link", false, p(), h(2, "Ideas"), tasks(task("Book the table", true)), p("Talked about the studio.")))],
    });
    expect(noteText(doc)).toBe("Quick call\nsend him the flat link\n\nIdeas\nBook the table\nTalked about the studio.");
  });

  it("keeps hard breaks, quotes, code blocks and deliberate blank lines", () => {
    const doc = docOf({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "line one" }, { type: "hardBreak" }, { type: "text", text: "line two" }] },
        p(),
        { type: "blockquote", content: [p("quoted")] },
        { type: "codeBlock", content: [{ type: "text", text: "a\nb" }] },
        { type: "orderedList", content: [{ type: "listItem", content: [p("first"), bullets("nested")] }] },
      ],
    });
    expect(noteText(doc)).toBe("line one\nline two\n\nquoted\na\nb\nfirst\nnested");
  });

  it("drops trailing empty lines and returns an empty string for an empty note", () => {
    expect(noteText(docOf({ type: "doc", content: [{ type: "heading", attrs: { level: 1 } }, p()] }))).toBe("");
    expect(noteText(docOf({ type: "doc", content: [p("Hi"), p(), p()] }))).toBe("Hi");
    expect(noteText(null)).toBe("");
  });

  it("feeds a list snippet that never runs two lines together", () => {
    const doc = docOf({ type: "doc", content: [h(1, "Lisbon trip"), tasks(task("send him the flat link")), h(2, "Dinner plans")] });
    expect(noteSnippet({ title: "Lisbon trip", contentText: noteText(doc) })).toBe("send him the flat link");
  });
});
