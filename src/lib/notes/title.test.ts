import { describe, expect, it } from "vitest";
import { displayTitle, firstLine, isBlankContent, NEW_NOTE_TITLE, nodeText, noteSnippet, TITLE_MAX, titleFromDoc, titleFromText } from "./title";

const p = (text?: string) => ({ type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}) });
const h1 = (text?: string) => ({ type: "heading", attrs: { level: 1 }, ...(text ? { content: [{ type: "text", text }] } : {}) });

describe("titleFromDoc", () => {
  it("uses the first block's text", () => {
    expect(titleFromDoc({ type: "doc", content: [h1("Coffee with Ana"), p("Talked about Berlin")] })).toBe("Coffee with Ana");
  });

  it("skips empty leading blocks (title left blank, body typed)", () => {
    expect(titleFromDoc({ type: "doc", content: [h1(), p(), p("Body first")] })).toBe("Body first");
  });

  it("returns null for an empty note", () => {
    expect(titleFromDoc({ type: "doc", content: [h1()] })).toBeNull();
    expect(titleFromDoc({ type: "doc", content: [h1("   "), p()] })).toBeNull();
    expect(titleFromDoc(null)).toBeNull();
  });

  it("takes the first line of a block with hard breaks and the first item of a list", () => {
    expect(titleFromDoc({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Line one" }, { type: "hardBreak" }, { type: "text", text: "Line two" }] }] })).toBe(
      "Line one",
    );
    const list = { type: "taskList", content: [{ type: "taskItem", attrs: { checked: false }, content: [p("Buy flowers")] }, { type: "taskItem", content: [p("Call")] }] };
    expect(titleFromDoc({ type: "doc", content: [list] })).toBe("Buy flowers");
  });

  it("collapses whitespace and caps very long titles", () => {
    expect(titleFromDoc({ type: "doc", content: [p("  Lots   of   space  ")] })).toBe("Lots of space");
    const long = "word ".repeat(80);
    const t = titleFromDoc({ type: "doc", content: [p(long)] })!;
    expect(t.length).toBeLessThanOrEqual(TITLE_MAX + 1);
    expect(t.endsWith("…")).toBe(true);
  });
});

describe("nodeText", () => {
  it("joins blocks with newlines", () => {
    expect(nodeText({ type: "doc", content: [h1("A"), p("B")] })).toBe("A\nB");
  });
});

describe("titleFromText", () => {
  it("strips markdown markers from the first non-empty line", () => {
    expect(titleFromText("\n\n# Lunch with Tom\nmore")).toBe("Lunch with Tom");
    expect(titleFromText("- [ ] call back")).toBe("call back");
    expect(titleFromText("**Bold title**")).toBe("Bold title");
    expect(titleFromText("☐ pack")).toBe("pack");
    expect(titleFromText("   ")).toBeNull();
  });
});

describe("display helpers", () => {
  it("falls back to the first line, then to “New note” (never “Untitled”)", () => {
    expect(displayTitle({ title: "Stored", excerpt: "Other" })).toBe("Stored");
    expect(displayTitle({ title: null, excerpt: "\nFirst line\nsecond" })).toBe("First line");
    expect(displayTitle({ title: "  ", contentText: "" })).toBe(NEW_NOTE_TITLE);
    expect(NEW_NOTE_TITLE).toBe("New note");
  });

  it("snippet skips the title line", () => {
    expect(noteSnippet({ title: "Coffee", excerpt: "Coffee\n\nWe talked about kids" })).toBe("We talked about kids");
    expect(noteSnippet({ title: null, excerpt: "Only line\nSecond" })).toBe("Second");
    expect(noteSnippet({ title: "Just a title", excerpt: "Just a title" })).toBe("");
  });

  it("snippet is the first meaningful line after the title", () => {
    // Old contentText (Tiptap getText) had blank lines from list wrappers.
    expect(noteSnippet({ title: "Lisbon", excerpt: "Lisbon\n\n\nsend him the flat link\nDinner plans" })).toBe("send him the flat link");
    // Markdown-ish plain text (quick composer, imports): markers never repeat the title or show up.
    expect(noteSnippet({ title: "Lunch with Tom", contentText: "# Lunch with Tom\n\n- [ ] book the table" })).toBe("book the table");
    expect(noteSnippet({ title: "Trip", excerpt: "Trip\n---\n•\n☐ pack" })).toBe("pack");
    // A separate title (imports): the text's first line is the snippet.
    expect(noteSnippet({ title: "Coffee with Ana", excerpt: "Talked about Berlin\nKids" })).toBe("Talked about Berlin");
    // A capped title ("…") still matches the full first line.
    expect(noteSnippet({ title: "A very long first line…", excerpt: "A very long first line that keeps going\nNext" })).toBe("Next");
  });

  it("display title strips markdown markers from a text-only note", () => {
    expect(displayTitle({ title: null, excerpt: "\n## Dinner plans\nok" })).toBe("Dinner plans");
  });

  it("detects blank content", () => {
    expect(isBlankContent({ title: null, contentText: " \n " })).toBe(true);
    expect(isBlankContent({ title: "T", contentText: "" })).toBe(false);
    expect(firstLine("\n  \n x  y \n")).toBe("x y");
  });
});
