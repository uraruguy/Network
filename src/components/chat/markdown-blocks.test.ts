import { describe, expect, it } from "vitest";
import { splitMarkdownBlocks } from "./markdown-blocks";

describe("splitMarkdownBlocks", () => {
  it("splits paragraphs on blank lines", () => {
    expect(splitMarkdownBlocks("Hello **there**.\n\nSecond paragraph\nstill second.\n\n\nThird")).toEqual([
      "Hello **there**.",
      "Second paragraph\nstill second.",
      "Third",
    ]);
  });

  it("keeps fenced code intact, blank lines included", () => {
    const md = "Intro\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\n\nAfter";
    expect(splitMarkdownBlocks(md)).toEqual(["Intro", "```ts\nconst a = 1;\n\nconst b = 2;\n```", "After"]);
  });

  it("treats an unterminated fence (still streaming) as one block", () => {
    expect(splitMarkdownBlocks("```\ncode\n\nmore")).toEqual(["```\ncode\n\nmore"]);
  });

  it("keeps loose lists together", () => {
    const md = "People:\n\n1. Ana\n\n2. Žan\n   - climber\n\n3. Miha\n\nDone.";
    expect(splitMarkdownBlocks(md)).toEqual(["People:", "1. Ana\n\n2. Žan\n   - climber\n\n3. Miha", "Done."]);
  });

  it("keeps indented continuation paragraphs in the list", () => {
    expect(splitMarkdownBlocks("- Ana\n\n  Met at the conference.\n\nNext")).toEqual(["- Ana\n\n  Met at the conference.", "Next"]);
  });

  it("returns stable earlier blocks while text grows", () => {
    const a = splitMarkdownBlocks("One\n\nTw");
    const b = splitMarkdownBlocks("One\n\nTwo three");
    expect(a[0]).toBe(b[0]);
    expect(b).toEqual(["One", "Two three"]);
  });

  it("handles empty input", () => {
    expect(splitMarkdownBlocks("")).toEqual([]);
    expect(splitMarkdownBlocks("\n\n")).toEqual([]);
  });
});
