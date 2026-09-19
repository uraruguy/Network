import TurndownService from "turndown";

let td: TurndownService | null = null;

/** Converts the Apple Notes HTML subset (div/h1-3/b/i/u/ul/ol/li/br/a/table) into Markdown. */
export function htmlToMarkdown(html: string) {
  td ??= (() => {
    const t = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced" });
    t.addRule("appleDiv", { filter: "div", replacement: (content) => `${content}\n` });
    t.addRule("checklist", {
      filter: (node) => node.nodeName === "LI" && (node.parentElement?.className ?? "").includes("checklist"),
      replacement: (content) => `- [ ] ${content.trim()}\n`,
    });
    return t;
  })();
  return td
    .turndown(html)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
