// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkboxPrefix, cleanPastedHtml, htmlIsPlainish, looksLikeMarkdown, parseDeclarations, parseStyleSheet, plainTextToMarkdown } from "./paste";

/** Synthetic fixtures that mimic real clipboard structures (fake text only). */
const fixture = (name: string) => readFileSync(`${process.cwd()}/src/lib/notes/__fixtures__/${name}`, "utf8");
const clean = (html: string) => cleanPastedHtml(html).html;

/** Parses the cleaned HTML so assertions read structurally. */
function blocks(html: string) {
  const doc = new DOMParser().parseFromString(clean(html), "text/html");
  return Array.from(doc.body.children).map((el) => ({ tag: el.tagName.toLowerCase(), text: el.textContent ?? "", el }));
}

describe("cleanPastedHtml — Apple Notes export (div per line)", () => {
  const html = fixture("apple-notes-export.html");
  const out = blocks(html);

  it("keeps native headings and unwraps <b><h2>", () => {
    expect(out[0]).toMatchObject({ tag: "h1", text: "Coffee with Mara Lindqvist" });
    expect(out.find((b) => b.text === "Family & home")?.tag).toBe("h2");
    expect(out.find((b) => b.text === "Follow-ups")?.tag).toBe("h3");
    expect(clean(html)).not.toMatch(/<h2><strong>|<strong><h2>/);
  });

  it("collapses runs of blank lines into one empty paragraph and trims the ends", () => {
    const tags = out.map((b) => (b.tag === "p" && !b.text ? "·" : b.tag));
    expect(tags.join(" ")).not.toMatch(/· ·/);
    expect(tags[tags.length - 1]).not.toBe("·");
    expect(tags.slice(0, 3)).toEqual(["h1", "·", "ul"]);
  });

  it("maps dash lists, ordered lists and keeps line structure", () => {
    expect(out.filter((b) => b.tag === "ul")).toHaveLength(2);
    expect(out.find((b) => b.tag === "ol")?.el.querySelectorAll("li")).toHaveLength(2);
    expect(out.some((b) => b.text === "Second line of the same thought, no blank line in between.")).toBe(true);
  });

  it("infers a short bold line as a subheading", () => {
    expect(out.find((b) => b.text === "Ideas")?.tag).toBe("h3");
  });

  it("maps tt to inline code, keeps b/i/u and inner <br>", () => {
    const h = clean(html);
    expect(h).toContain("<code>studio.open = true</code>");
    expect(h).toContain("<u>shipping logistics</u>");
    expect(h).toContain("<em>Quiet voice</em><br><strong>Loud laugh</strong>");
    expect(h).not.toMatch(/<br><\/p>/); // trailing breaks dropped
  });

  it("drops images (Genmoji pictures) and reports them", () => {
    const r = cleanPastedHtml(html);
    expect(r.images).toBe(1);
    expect(r.html).not.toMatch(/picture|source|img|data:image/);
  });

  it("strips every class and style attribute", () => {
    expect(clean(html)).not.toMatch(/class=|style=/);
  });
});

describe("cleanPastedHtml — multi-run Apple title", () => {
  it("merges heading runs of one line and demotes the body-sized run", () => {
    const out = blocks(fixture("apple-notes-multirun-title.html"));
    expect(out[0]).toMatchObject({ tag: "h1", text: "Dinner at Harbour Kitchen with the Okafors" });
    expect(out[1]).toMatchObject({ tag: "p", text: "We sat outside until late and talked about the new house and the boat." });
    expect(out.find((b) => b.text === "Kids")?.tag).toBe("h2");
  });
});

describe("cleanPastedHtml — Cocoa HTML Writer (copy from Notes.app)", () => {
  const html = fixture("apple-notes-cocoa.html");
  const out = blocks(html);

  it("infers headings from <style> class font sizes", () => {
    expect(out[0]).toMatchObject({ tag: "h1", text: "Lunch with Tomasz Wierzbicki" });
    expect(out.find((b) => b.text === "Work")?.tag).toBe("h2");
    expect(out.find((b) => b.text.startsWith("Met at the usual place"))?.tag).toBe("p");
  });

  it("treats a class-bold short line as a subheading", () => {
    expect(out.find((b) => b.text === "Next steps")?.tag).toBe("h3");
  });

  it("maps ul.checklist with li.checked to a task list", () => {
    const list = out.find((b) => b.el.getAttribute("data-type") === "taskList");
    expect(list).toBeDefined();
    const items = Array.from(list!.el.querySelectorAll('li[data-type="taskItem"]'));
    expect(items.map((i) => [i.textContent, i.getAttribute("data-checked")])).toEqual([
      ["Send him the deck", "true"],
      ["Book a follow-up call", "false"],
    ]);
  });

  it("keeps http(s) and mailto links", () => {
    const h = clean(html);
    expect(h).toContain('<a href="https://example.com/design">design</a>');
    expect(h).toContain('<a href="mailto:tomasz@example.com">tomasz@example.com</a>');
  });

  it("drops the head, meta and the stylesheet", () => {
    expect(clean(html)).not.toMatch(/Cocoa|font-kerning|<style|<meta|<title/);
  });
});

describe("cleanPastedHtml — checklist prefixes", () => {
  const out = blocks(fixture("checklist-prefixes.html"));
  const items = (i: number) =>
    Array.from(out.filter((b) => b.el.getAttribute("data-type") === "taskList")[i]!.el.querySelectorAll("li")).map((li) => [
      li.textContent,
      li.getAttribute("data-checked"),
    ]);

  it("turns ☐ ☑ ✓ ◦ lines into one checklist with checked state", () => {
    expect(out[0]).toMatchObject({ tag: "p", text: "Packing for the offsite" });
    expect(items(0)).toEqual([
      ["Charger", "false"],
      ["Passport", "true"],
      ["Rain jacket", "true"],
      ["Gift for Lena", "false"],
    ]);
  });

  it("converts bullet lists whose items all carry markers, and [x] / - [ ] lines", () => {
    expect(items(1)).toEqual([
      ["Book table", "false"],
      ["Confirm headcount", "true"],
      ["Already paid", "true"],
      ["Print badges", "false"],
    ]);
  });
});

describe("cleanPastedHtml — web / Docs / Word junk", () => {
  const html = fixture("web-junk.html");
  const r = cleanPastedHtml(html);
  const out = blocks(html);

  it("respects font-weight:normal on the Google Docs wrapper", () => {
    expect(out[0]).toMatchObject({ tag: "h1", text: "Quarterly catch-up" });
    expect(r.html).toContain("Plain sentence with a <strong>bold bit</strong><em> and italics</em>.");
    expect(r.html).toContain("<s>Old idea</s>");
  });

  it("removes scripts, styles, hidden text and Word list bullets", () => {
    expect(r.html).not.toMatch(/alert|color: red|hidden text|·<|o:p/);
    expect(out.some((b) => b.text === "Word bullet text")).toBe(true);
  });

  it("keeps only http/https/mailto links and drops link attributes", () => {
    expect(r.html).toContain("bad link · relative · ");
    expect(r.html).not.toMatch(/javascript:|\/relative\/path|target=|onclick|class=/);
    expect(r.html).toContain('<a href="https://example.org/ok">good link</a>');
    expect(r.html).toContain('<a href="mailto:hi@example.org">mail</a>');
  });

  it("drops images and flattens tables to one paragraph per row", () => {
    expect(r.images).toBe(1);
    expect(r.tables).toBe(1);
    expect(r.html).not.toMatch(/<table|<td|<tr|<img/);
    expect(out.map((b) => b.text)).toEqual(expect.arrayContaining(["Name · Role", "Iris · CTO", "Noor · Design lead"]));
  });

  it("keeps blockquotes and code blocks", () => {
    expect(r.html).toContain("<blockquote><p>Quoted line</p></blockquote>");
    expect(r.html).toContain("<pre><code>const a = 1;\nconst b = 2;</code></pre>");
  });

  it("collapses empty paragraphs", () => {
    expect(r.html).not.toMatch(/<p><\/p><p><\/p>/);
    expect(out[out.length - 1]).toMatchObject({ tag: "p", text: "Last line" });
  });
});

describe("cleanPastedHtml — edge cases", () => {
  it("passes HTML copied from the editor itself through untouched", () => {
    const own = '<h1 data-pm-slice="1 1 []">Title</h1><p class="x">Body</p>';
    expect(clean(own)).toBe(own);
  });

  it("does not turn a single pasted bold phrase into a heading", () => {
    expect(clean("<b>Important</b>")).toBe("<p><strong>Important</strong></p>");
  });

  it("infers h1/h2 from inline font sizes relative to the body size", () => {
    const h = clean('<div><span style="font-size: 26px">Big</span></div><div><span style="font-size: 19px">Medium</span></div><div><span style="font-size: 13px">Body text here</span></div>');
    expect(h).toBe("<h1>Big</h1><h2>Medium</h2><p>Body text here</p>");
  });

  it("does not promote large body text (e.g. 20px article paragraphs)", () => {
    const h = clean('<p style="font-size: 20px">First paragraph of an article.</p><p style="font-size: 20px">Second paragraph of it.</p>');
    expect(h).toBe("<p>First paragraph of an article.</p><p>Second paragraph of it.</p>");
  });

  it("returns empty html for image-only content", () => {
    expect(cleanPastedHtml('<img src="a.png"><img src="b.png">')).toEqual({ html: "", images: 2, tables: 0 });
  });

  it("detects checked checkboxes inside list items", () => {
    const h = clean('<ul><li><input type="checkbox" checked> Done thing</li><li><input type="checkbox"> Open thing</li></ul>');
    expect(h).toBe('<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Done thing</p></li><li data-type="taskItem" data-checked="false"><p>Open thing</p></li></ul>');
  });
});

describe("style parsing", () => {
  it("parses font shorthand, weights and pt sizes", () => {
    expect(parseDeclarations("font: bold 24.0px 'Helvetica Neue'")).toMatchObject({ size: 24, bold: true });
    expect(parseDeclarations("font-size: 18pt; font-weight: 400")).toMatchObject({ size: 24, bold: false });
    expect(parseDeclarations("font-family: Menlo; text-decoration: underline line-through")).toMatchObject({ mono: true, underline: true, strike: true });
  });

  it("maps class selectors from a stylesheet", () => {
    const map = parseStyleSheet("p.p1 {font: 24.0px X} span.s2, .s3 {font-weight: bold} div > p.x {font-size: 40px}");
    expect(map.get("p1")).toMatchObject({ size: 24 });
    expect(map.get("s2")).toMatchObject({ bold: true });
    expect(map.get("s3")).toMatchObject({ bold: true });
    expect(map.has("x")).toBe(false);
  });
});

describe("checkboxPrefix", () => {
  it.each([
    ["☐ a", false],
    ["◦ a", false],
    ["[ ] a", false],
    ["- [ ] a", false],
    ["☑ a", true],
    ["✓ a", true],
    ["✔ a", true],
    ["[x] a", true],
    ["- [X] a", true],
  ])("%s → checked=%s", (text, checked) => {
    expect(checkboxPrefix(text)).toMatchObject({ checked });
  });

  it("ignores ordinary text", () => {
    expect(checkboxPrefix("Call Anna")).toBeNull();
    expect(checkboxPrefix("- item")).toBeNull();
  });
});

describe("markdown detection", () => {
  it("recognises markdown structure", () => {
    expect(looksLikeMarkdown("# Heading\nText")).toBe(true);
    expect(looksLikeMarkdown("- [ ] task")).toBe(true);
    expect(looksLikeMarkdown("- one\n- two")).toBe(true);
    expect(looksLikeMarkdown("See [docs](https://example.com)")).toBe(true);
    expect(looksLikeMarkdown("```\ncode\n```")).toBe(true);
  });

  it("leaves ordinary text alone", () => {
    expect(looksLikeMarkdown("Met Anna for coffee.\nShe is moving to Berlin.")).toBe(false);
    expect(looksLikeMarkdown("- just one dash line")).toBe(false);
    expect(looksLikeMarkdown("#hashtag in text")).toBe(false);
  });

  it("knows when HTML has no real structure", () => {
    expect(htmlIsPlainish('<div><span style="color:red"># Title</span></div>')).toBe(true);
    expect(htmlIsPlainish("<p><strong>Bold</strong></p>")).toBe(false);
  });
});

describe("plainTextToMarkdown", () => {
  it("keeps lines, collapses blank runs and converts checkbox symbols", () => {
    expect(plainTextToMarkdown("Coffee with Ana\r\nTalked about:\n- kids\n\n\n\n☐ send link\n✓ booked  ")).toBe(
      "Coffee with Ana\nTalked about:\n- kids\n\n- [ ] send link\n- [x] booked",
    );
  });
});
