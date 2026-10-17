/**
 * Clean paste. Turns whatever the clipboard holds (Apple Notes, Cocoa "HTML Writer" output,
 * Google Docs, Word, web pages) into the small HTML subset the note editor understands:
 *
 *   h1–h3 · p · br · ul/ol/li · task lists · blockquote · pre/code · a[href] · strong · em · u · s · code
 *
 * Headings are inferred from font sizes (`<style>` rules and inline styles) when the source has
 * no heading tags; checklists from `ul.checklist`, checkbox inputs and ☐ ☑ ✓ ◦ prefixes. All
 * styles and classes are dropped, empty-line runs collapse, images and tables are reported (the
 * caller tells the user) and tables flatten to one paragraph per row.
 *
 * Pure apart from DOMParser (browser, or happy-dom in tests).
 */

export type CleanResult = {
  html: string;
  /** Images (img/picture/video) that were dropped. */
  images: number;
  /** Tables that were flattened into paragraphs. */
  tables: number;
};

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

type Style = { size?: number; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; mono?: boolean; hidden?: boolean };

const SIZE_KEYWORDS: Record<string, number> = { "xx-small": 9, "x-small": 10, small: 13, medium: 16, large: 18, "x-large": 24, "xx-large": 32, "xxx-large": 48 };
const MONO = /mono|menlo|courier|consolas|monaco|sf ?mono/i;

function toPx(value: string): number | undefined {
  const m = /(\d+(?:\.\d+)?)\s*(px|pt)\b/i.exec(value);
  if (m) return Math.round(Number(m[1]) * (m[2]!.toLowerCase() === "pt" ? 4 / 3 : 1) * 10) / 10;
  const kw = value.trim().toLowerCase();
  return SIZE_KEYWORDS[kw];
}

function boldFromWeight(v: string): boolean | undefined {
  const w = v.trim().toLowerCase();
  if (w === "bold" || w === "bolder") return true;
  if (w === "normal" || w === "lighter") return false;
  const n = Number(w);
  return Number.isFinite(n) && n > 0 ? n >= 600 : undefined;
}

/** Parses a CSS declaration block ("font: bold 24px Helvetica; color: …"). */
export function parseDeclarations(text: string): Style {
  const s: Style = {};
  for (const decl of text.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).trim();
    switch (prop) {
      case "font-size":
        s.size = toPx(value) ?? s.size;
        break;
      case "font-weight":
        s.bold = boldFromWeight(value) ?? s.bold;
        break;
      case "font-style":
        s.italic = /italic|oblique/i.test(value);
        break;
      case "font-family":
        if (MONO.test(value)) s.mono = true;
        break;
      case "text-decoration":
      case "text-decoration-line":
        if (/underline/i.test(value)) s.underline = true;
        if (/line-through/i.test(value)) s.strike = true;
        break;
      case "font": {
        s.size = toPx(value) ?? s.size;
        const weight = /\b(bold|bolder|[1-9]00)\b/i.exec(value);
        if (weight) s.bold = boldFromWeight(weight[1]!) ?? s.bold;
        if (/\bitalic\b/i.test(value)) s.italic = true;
        if (MONO.test(value)) s.mono = true;
        break;
      }
      case "mso-list":
        if (/ignore/i.test(value)) s.hidden = true;
        break;
      case "display":
        if (/^none\b/i.test(value)) s.hidden = true;
        break;
    }
  }
  return s;
}

/** Class rules from `<style>` blocks: `p.p1 {…}` / `.s1 {…}` → className → Style. */
export function parseStyleSheet(css: string): Map<string, Style> {
  const map = new Map<string, Style>();
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = /([^{}]+)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = rule.exec(text))) {
    const style = parseDeclarations(m[2]!);
    for (const sel of m[1]!.split(",")) {
      const cls = /^\s*[a-z0-9]*\.([\w-]+)\s*$/i.exec(sel);
      if (cls) map.set(cls[1]!, { ...map.get(cls[1]!), ...style });
    }
  }
  return map;
}

/* ------------------------------------------------------------------ */
/*  Model                                                              */
/* ------------------------------------------------------------------ */

type Marks = { b?: boolean; i?: boolean; u?: boolean; s?: boolean; code?: boolean; href?: string };
type TextRun = Marks & { text: string; size?: number };
type Inline = TextRun | { br: true };
type HeadingTag = "h1" | "h2" | "h3";
type Para = { type: "para"; tag: "p" | HeadingTag; explicit: boolean; inlines: Inline[]; size?: number; line: number; empty?: boolean };
type Item = { checked?: boolean; blocks: Block[] };
type List = { type: "list"; kind: "ul" | "ol" | "task"; items: Item[] };
type Quote = { type: "quote"; blocks: Block[] };
type Pre = { type: "pre"; text: string };
type Block = Para | List | Quote | Pre;

type Ctx = Marks & { size?: number };

const isBr = (x: Inline): x is { br: true } => "br" in x;
const runText = (p: Para) => p.inlines.map((x) => (isBr(x) ? "\n" : x.text)).join("");

const SKIP = new Set(["script", "style", "head", "title", "meta", "link", "template", "noscript", "input", "button", "select", "textarea", "option", "svg", "math", "iframe", "object", "embed", "canvas", "audio", "map", "area", "source", "track", "colgroup", "col"]);
const IMAGES = new Set(["img", "picture", "video", "image"]);
const LINE_BLOCKS = new Set(["p", "div", "section", "article", "header", "footer", "main", "aside", "nav", "address", "figure", "figcaption", "center", "dd", "dt", "details", "summary", "form", "fieldset", "legend", "body", "html", "hgroup", "dl"]);
const HEADINGS: Record<string, HeadingTag> = { h1: "h1", h2: "h2", h3: "h3", h4: "h3", h5: "h3", h6: "h3" };
const FONT_SIZE_ATTR: Record<string, number> = { "1": 10, "2": 13, "3": 16, "4": 18, "5": 24, "6": 32, "7": 48 };

const ALLOWED_HREF = /^(https?:|mailto:)/i;

/** ☐ ◦ ○ □ ⬜ / [ ] → unchecked;  ☑ ✓ ✔ ✅ ☒ / [x] → checked. Optional "- " before brackets. */
const CHECK_PREFIX = /^\s*(?:(?:[-*+]\s+)?\[([ xX])\]|([☐◦○□⬜❏])|([☑✓✔✅☒]))\s*/u;

/** Checkbox marker at the start of a line → checked state (or null when there is none). */
export function checkboxPrefix(text: string): { checked: boolean; length: number } | null {
  const m = CHECK_PREFIX.exec(text);
  if (!m) return null;
  const checked = m[1] !== undefined ? m[1].toLowerCase() === "x" : !!m[3];
  return { checked, length: m[0].length };
}

class Cleaner {
  root: Block[] = [];
  private stack: Block[][] = [this.root];
  private para: Para | null = null;
  private lineSeq = 0;
  private line = 0;
  private flat = 0;
  private listDepth = 0;
  images = 0;
  tables = 0;

  constructor(private classes: Map<string, Style>) {}

  private get container() {
    return this.stack[this.stack.length - 1]!;
  }

  private styleOf(el: Element): Style {
    let s: Style = {};
    const cls = el.getAttribute("class");
    if (cls && this.classes.size) for (const c of cls.split(/\s+/)) if (this.classes.has(c)) s = { ...s, ...this.classes.get(c) };
    const inline = el.getAttribute("style");
    if (inline) s = { ...s, ...parseDeclarations(inline) };
    return s;
  }

  private derive(ctx: Ctx, el: Element, tag: string): Ctx | null {
    const s = this.styleOf(el);
    if (s.hidden) return null;
    const next: Ctx = { ...ctx };
    switch (tag) {
      case "b":
      case "strong":
        next.b = true;
        break;
      case "i":
      case "em":
      case "cite":
      case "dfn":
        next.i = true;
        break;
      case "u":
      case "ins":
        next.u = true;
        break;
      case "s":
      case "strike":
      case "del":
        next.s = true;
        break;
      case "code":
      case "tt":
      case "kbd":
      case "samp":
        next.code = true;
        break;
      case "font": {
        const size = FONT_SIZE_ATTR[el.getAttribute("size") ?? ""];
        if (size) next.size = size;
        if (MONO.test(el.getAttribute("face") ?? "")) next.code = true;
        break;
      }
      case "a": {
        const href = el.getAttribute("href")?.trim();
        if (href && ALLOWED_HREF.test(href)) next.href = href;
        break;
      }
    }
    if (s.bold !== undefined) next.b = s.bold;
    if (s.italic !== undefined) next.i = s.italic;
    if (s.underline) next.u = true;
    if (s.strike) next.s = true;
    if (s.mono) next.code = true;
    if (s.size !== undefined) next.size = s.size;
    return next;
  }

  /* ---- paragraph assembly ---- */

  private open(): Para {
    if (!this.para) this.para = { type: "para", tag: "p", explicit: false, inlines: [], line: this.line };
    return this.para;
  }

  private text(data: string, ctx: Ctx) {
    let t = data.replace(/[\t\n\r\f ]+/g, " ");
    if (!t) return;
    if (t === " " && (!this.para || !this.para.inlines.length)) return;
    const last = this.para?.inlines[this.para.inlines.length - 1];
    if (last && !isBr(last) && last.text.endsWith(" ") && t.startsWith(" ")) t = t.slice(1);
    if (!t) return;
    const { size, ...marks } = ctx;
    this.open().inlines.push({ ...marks, text: t, size });
  }

  private br() {
    if (this.flat) return this.text(" ", {});
    this.open().inlines.push({ br: true });
  }

  /** Ends the current paragraph. `keepEmpty` turns a blank line (`<div><br></div>`) into an empty paragraph. */
  private flush(keepEmpty = false) {
    const p = this.para;
    this.para = null;
    if (!p) {
      if (keepEmpty) this.container.push({ type: "para", tag: "p", explicit: false, inlines: [], line: this.line, empty: true });
      return;
    }
    while (p.inlines.length && isBr(p.inlines[p.inlines.length - 1]!)) p.inlines.pop();
    trimRuns(p);
    if (!runText(p).trim()) {
      if (keepEmpty || p.explicit) this.container.push({ type: "para", tag: "p", explicit: false, inlines: [], line: p.line, empty: true });
      return;
    }
    this.container.push(p);
  }

  /** Flushes text that sat directly in <body>. */
  finish() {
    this.flush();
    return this.root;
  }

  /* ---- walking ---- */

  walkChildren(node: Node, ctx: Ctx) {
    for (let c = node.firstChild; c; c = c.nextSibling) this.walk(c, ctx);
  }

  walk(node: Node, ctx: Ctx) {
    if (node.nodeType === 3) return this.text((node as Text).data, ctx);
    if (node.nodeType !== 1) return; // comments, processing instructions
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (SKIP.has(tag)) return;
    if (IMAGES.has(tag)) {
      this.images++;
      return;
    }
    const next = this.derive(ctx, el, tag);
    if (!next) return;

    if (tag === "br") return this.br();
    if (tag === "hr") return this.flat ? this.text(" ", {}) : this.flush();

    if (this.flat) {
      // Inside a table cell: blocks become spaces.
      const block = LINE_BLOCKS.has(tag) || tag in HEADINGS || tag === "li" || tag === "ul" || tag === "ol" || tag === "blockquote" || tag === "pre";
      if (block) this.text(" ", {});
      this.walkChildren(el, next);
      if (block) this.text(" ", {});
      return;
    }

    if (tag in HEADINGS) return this.heading(el, HEADINGS[tag]!, next);
    if (tag === "ul" || tag === "ol" || tag === "menu") return this.list(el, tag === "ol" ? "ol" : "ul", next);
    if (tag === "blockquote") return this.quote(el, next);
    if (tag === "pre") return this.pre(el);
    if (tag === "table") return this.table(el, next);
    if (LINE_BLOCKS.has(tag) || tag === "li" || tag === "tr" || tag === "td" || tag === "th" || tag === "caption") return this.block(el, next);
    // Inline (span, font, b, a, o:p, unknown…)
    this.walkChildren(el, next);
  }

  private block(el: Element, ctx: Ctx) {
    this.flush();
    const outer = this.line;
    this.line = ++this.lineSeq;
    const before = this.container.length;
    const blockSize = this.styleOf(el).size;
    this.walkChildren(el, ctx);
    const producedBlocks = this.container.length > before;
    if (this.para && blockSize !== undefined) this.para.size ??= blockSize;
    // A line element that held nothing but <br> is a deliberate blank line.
    this.flush(!producedBlocks && el.tagName.toLowerCase() !== "body" && el.tagName.toLowerCase() !== "html");
    this.line = outer;
  }

  private heading(el: Element, tag: HeadingTag, ctx: Ctx) {
    this.flush();
    const para: Para = { type: "para", tag, explicit: true, inlines: [], line: this.line || ++this.lineSeq };
    this.para = para;
    this.walkChildren(el, ctx);
    this.flush();
  }

  private list(el: Element, kind: "ul" | "ol", ctx: Ctx) {
    this.flush();
    const cls = (el.getAttribute("class") ?? "").toLowerCase();
    const isTask = /checklist|task/.test(cls) || el.getAttribute("data-type") === "taskList";
    const list: List = { type: "list", kind: isTask ? "task" : kind, items: [] };
    this.container.push(list);
    this.listDepth++;
    let current: Item | null = null;
    const startItem = (checked?: boolean) => {
      current = { checked, blocks: [] };
      list.items.push(current);
      return current;
    };
    for (let c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3 && !(c as Text).data.trim()) continue;
      const isLi = c.nodeType === 1 && (c as Element).tagName.toLowerCase() === "li";
      const isNestedList = c.nodeType === 1 && ["ul", "ol"].includes((c as Element).tagName.toLowerCase());
      const item: Item = isLi ? startItem(checkedOf(c as Element)) : isNestedList && current ? current : startItem();
      this.stack.push(item.blocks);
      const outer = this.line;
      this.line = ++this.lineSeq;
      if (isLi) this.walkChildren(c, ctx);
      else this.walk(c, ctx);
      this.flush();
      this.line = outer;
      this.stack.pop();
    }
    this.listDepth--;
    finishList(list);
    if (!list.items.length) this.container.splice(this.container.indexOf(list), 1);
  }

  private quote(el: Element, ctx: Ctx) {
    this.flush();
    const q: Quote = { type: "quote", blocks: [] };
    this.container.push(q);
    this.stack.push(q.blocks);
    this.walkChildren(el, ctx);
    this.flush();
    this.stack.pop();
    if (!q.blocks.some((b) => b.type !== "para" || !b.empty)) this.container.splice(this.container.indexOf(q), 1);
  }

  private pre(el: Element) {
    this.flush();
    const text = (el.textContent ?? "").replace(/\r\n?/g, "\n").replace(/^\n+|\s+$/g, "");
    if (text) this.container.push({ type: "pre", text });
  }

  private table(el: Element, ctx: Ctx) {
    this.flush();
    this.tables++;
    const rows = Array.from(el.querySelectorAll("tr")).filter((tr) => tr.closest("table") === el);
    for (const tr of rows) {
      this.line = ++this.lineSeq;
      this.flat++;
      let first = true;
      for (const cell of Array.from(tr.children)) {
        const t = cell.tagName.toLowerCase();
        if (t !== "td" && t !== "th") continue;
        if (!(cell.textContent ?? "").trim()) continue;
        if (!first) this.text(" · ", {});
        first = false;
        const cellCtx = this.derive(ctx, cell, t);
        if (cellCtx) this.walkChildren(cell, cellCtx);
      }
      this.flat--;
      this.flush();
    }
    this.line = 0;
  }
}

function checkedOf(li: Element): boolean | undefined {
  const cls = (li.getAttribute("class") ?? "").toLowerCase();
  const data = li.getAttribute("data-checked") ?? li.getAttribute("aria-checked");
  if (data === "true" || data === "") return true;
  if (data === "false") return false;
  if (/\b(checked|done|completed)\b/.test(cls)) return true;
  const box = li.querySelector('input[type="checkbox"]');
  if (box && box.closest("li") === li) return box.hasAttribute("checked");
  if (/\bunchecked\b/.test(cls)) return false;
  return undefined;
}

/** Strips a checkbox marker from the start of a paragraph's text runs. */
function stripPrefix(p: Para, length: number) {
  let left = length;
  while (left > 0 && p.inlines.length) {
    const first = p.inlines[0]!;
    if (isBr(first)) break;
    if (first.text.length <= left) {
      left -= first.text.length;
      p.inlines.shift();
    } else {
      first.text = first.text.slice(left);
      left = 0;
    }
  }
  trimRuns(p);
}

function finishList(list: List) {
  list.items = list.items.filter((it) => it.blocks.some((b) => b.type !== "para" || !b.empty));
  for (const it of list.items) it.blocks = collapseEmpties(it.blocks, true);
  // Items that start with ☐/☑ markers make the whole list a checklist (when every item has one).
  const markers = list.items.map((it) => {
    const first = it.blocks[0];
    return first?.type === "para" ? checkboxPrefix(runText(first)) : null;
  });
  const allMarked = list.items.length > 0 && markers.every((m, i) => m || list.items[i]!.checked !== undefined);
  if (list.kind === "task" || (allMarked && markers.some(Boolean))) {
    list.kind = "task";
    list.items.forEach((it, i) => {
      const m = markers[i];
      if (m) {
        stripPrefix(it.blocks[0] as Para, m.length);
        it.checked ??= m.checked;
      }
      it.checked ??= false;
    });
  } else if (list.items.every((it) => it.checked !== undefined)) {
    list.kind = "task";
  }
}

function trimRuns(p: Para) {
  const runs = p.inlines;
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i]!;
    if (isBr(r)) break;
    r.text = r.text.replace(/^\s+/, "");
    if (r.text) break;
  }
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i]!;
    if (isBr(r)) break;
    r.text = r.text.replace(/\s+$/, "");
    if (r.text) break;
  }
  p.inlines = runs.filter((r) => isBr(r) || r.text);
}

/** Drops leading/trailing blank lines and collapses runs of blank lines into one. */
function collapseEmpties(blocks: Block[], dropAll = false): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    const empty = b.type === "para" && b.empty;
    if (empty && (dropAll || !out.length || (out[out.length - 1]!.type === "para" && (out[out.length - 1] as Para).empty))) continue;
    out.push(b);
  }
  while (out.length && out[out.length - 1]!.type === "para" && (out[out.length - 1] as Para).empty) out.pop();
  return out;
}

/* ------------------------------------------------------------------ */
/*  Post-processing                                                    */
/* ------------------------------------------------------------------ */

const textRuns = (p: Para) => p.inlines.filter((x): x is TextRun => !isBr(x) && !!x.text.trim());

/** The font size most of the text is set in (the body size). */
function bodySize(blocks: Block[]): number | undefined {
  const weight = new Map<number, number>();
  const visit = (bs: Block[]) => {
    for (const b of bs) {
      if (b.type === "para") {
        for (const r of textRuns(b)) {
          const size = r.size ?? b.size ?? -1; // -1: unknown (browser default)
          weight.set(size, (weight.get(size) ?? 0) + r.text.length);
        }
      } else if (b.type === "list") b.items.forEach((it) => visit(it.blocks));
      else if (b.type === "quote") visit(b.blocks);
    }
  };
  visit(blocks);
  let best: number | undefined;
  let bestWeight = 0;
  for (const [size, w] of weight) if (w > bestWeight) [best, bestWeight] = [size, w];
  return best === -1 ? undefined : best;
}

/** Smallest font size covering all of a paragraph's text (undefined when unknown). */
function paraSize(p: Para): number | undefined {
  let min: number | undefined;
  for (const r of textRuns(p)) {
    const s = r.size ?? p.size;
    if (s === undefined) return undefined;
    min = min === undefined ? s : Math.min(min, s);
  }
  return min;
}

function inferHeadings(blocks: Block[]) {
  const body = bodySize(blocks) ?? 13;
  const nonEmpty = blocks.filter((b) => b.type !== "para" || !b.empty).length;

  // Apple Notes writes a styled line as several heading runs in one <div>; an inner run set in
  // body size is really body text. Merge same-line runs afterwards.
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type !== "para" || !b.explicit || b.tag === "p") continue;
    const sameLine = blocks.some((o, j) => j !== i && o.type === "para" && o.line === b.line && o.line !== 0);
    const size = paraSize(b);
    if (sameLine && size !== undefined && size < Math.max(17, body * 1.15)) b.tag = "p";
  }

  for (const b of blocks) {
    if (b.type !== "para" || b.explicit || b.empty) continue;
    const size = paraSize(b);
    if (size !== undefined && size >= 24 && size >= body * 1.4) b.tag = "h1";
    else if (size !== undefined && size >= 18 && size >= body * 1.2) b.tag = "h2";
    else if (nonEmpty >= 2) {
      const runs = textRuns(b);
      const text = runText(b).trim();
      const shortBold =
        runs.length > 0 &&
        runs.every((r) => r.b && !r.code) &&
        text.length <= 80 &&
        !text.includes("\n") &&
        !/[.,;]$/.test(text) &&
        !checkboxPrefix(text);
      if (shortBold) b.tag = "h3";
    }
  }
}

/** Joins consecutive runs of the same heading level that came from one source line. */
function mergeSameLine(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    if (b.type === "para" && prev?.type === "para" && !b.empty && !prev.empty && b.line !== 0 && b.line === prev.line && b.tag === prev.tag) {
      const last = prev.inlines[prev.inlines.length - 1];
      const first = b.inlines[0];
      const needsSpace = last && first && !isBr(last) && !isBr(first) && !/\s$/.test(last.text) && !/^\s/.test(first.text);
      prev.inlines.push(...(needsSpace ? [{ text: " " } as TextRun] : []), ...b.inlines);
      continue;
    }
    out.push(b);
  }
  return out;
}

/** Consecutive "☐ …" / "☑ …" paragraphs become one checklist. */
function prefixedParagraphsToTasks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    const m = b.type === "para" && b.tag === "p" && !b.empty ? checkboxPrefix(runText(b)) : null;
    if (b.type === "para" && m) {
      stripPrefix(b, m.length);
      const item: Item = { checked: m.checked, blocks: [b] };
      const prev = out[out.length - 1];
      if (prev?.type === "list" && prev.kind === "task") prev.items.push(item);
      else out.push({ type: "list", kind: "task", items: [item] });
      continue;
    }
    out.push(b);
  }
  return out;
}

function postProcess(blocks: Block[], top: boolean): Block[] {
  let bs = blocks;
  for (const b of bs) {
    if (b.type === "list") for (const it of b.items) it.blocks = postProcess(it.blocks, false);
    else if (b.type === "quote") b.blocks = postProcess(b.blocks, false);
  }
  if (top) inferHeadings(bs);
  bs = mergeSameLine(bs);
  bs = prefixedParagraphsToTasks(bs);
  for (const b of bs) if (b.type === "para" && b.tag !== "p") b.inlines.forEach((r) => !isBr(r) && delete r.b);
  return collapseEmpties(bs);
}

/* ------------------------------------------------------------------ */
/*  Serialisation                                                      */
/* ------------------------------------------------------------------ */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sameMarks = (a: TextRun, b: TextRun) => !!a.b === !!b.b && !!a.i === !!b.i && !!a.u === !!b.u && !!a.s === !!b.s && !!a.code === !!b.code && a.href === b.href;

function renderInlines(inlines: Inline[]): string {
  const merged: Inline[] = [];
  for (const r of inlines) {
    const prev = merged[merged.length - 1];
    if (prev && !isBr(prev) && !isBr(r) && sameMarks(prev, r)) merged[merged.length - 1] = { ...prev, text: prev.text + r.text };
    else merged.push(isBr(r) ? r : { ...r });
  }
  return merged
    .map((r) => {
      if (isBr(r)) return "<br>";
      let h = esc(r.text);
      if (r.code) h = `<code>${h}</code>`;
      if (r.s) h = `<s>${h}</s>`;
      if (r.u) h = `<u>${h}</u>`;
      if (r.i) h = `<em>${h}</em>`;
      if (r.b) h = `<strong>${h}</strong>`;
      if (r.href) h = `<a href="${esc(r.href)}">${h}</a>`;
      return h;
    })
    .join("");
}

function render(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "para":
          return `<${b.tag}>${renderInlines(b.inlines)}</${b.tag}>`;
        case "pre":
          return `<pre><code>${esc(b.text)}</code></pre>`;
        case "quote":
          return `<blockquote>${render(b.blocks)}</blockquote>`;
        case "list": {
          if (b.kind === "task")
            return `<ul data-type="taskList">${b.items.map((it) => `<li data-type="taskItem" data-checked="${it.checked ? "true" : "false"}">${render(it.blocks) || "<p></p>"}</li>`).join("")}</ul>`;
          return `<${b.kind}>${b.items.map((it) => `<li>${render(it.blocks) || "<p></p>"}</li>`).join("")}</${b.kind}>`;
        }
      }
    })
    .join("");
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** True for HTML copied from a ProseMirror/Tiptap editor (ours): it already has the right shape. */
export function isEditorHtml(html: string): boolean {
  return /data-pm-slice=/.test(html);
}

/** Cleans clipboard HTML into the editor's subset. */
export function cleanPastedHtml(html: string, parser: DOMParser = new DOMParser()): CleanResult {
  if (isEditorHtml(html)) return { html, images: 0, tables: 0 };
  const doc = parser.parseFromString(html, "text/html");
  const css = Array.from(doc.querySelectorAll("style"))
    .map((s) => s.textContent ?? "")
    .join("\n");
  const cleaner = new Cleaner(css ? parseStyleSheet(css) : new Map());
  if (doc.body) cleaner.walkChildren(doc.body, {});
  const blocks = postProcess(cleaner.finish(), true);
  return { html: render(blocks), images: cleaner.images, tables: cleaner.tables };
}

/**
 * Heuristic: does pasted plain text look like Markdown (headings, task items, fenced code,
 * links, bold, or several list lines)? A single "- item" line is not enough.
 */
export function looksLikeMarkdown(text: string): boolean {
  let score = 0;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s{0,3}#{1,6}\s+\S/.test(line)) score += 2;
    else if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) score += 2;
    else if (/^\s{0,3}(```|~~~)/.test(line)) score += 2;
    else if (/^\s*(?:[-*+]|\d{1,3}[.)])\s+\S/.test(line)) score += 1;
    else if (/^\s{0,3}>\s?\S/.test(line)) score += 1;
    if (/\*\*[^*\s][^*]*\*\*|__[^_\s][^_]*__/.test(line)) score += 1;
    if (/\[[^\]\n]+\]\((?:https?:|mailto:)[^)\s]+\)/.test(line)) score += 2;
    if (score >= 2) return true;
  }
  return false;
}

/**
 * True when clipboard HTML carries no real structure (code editors, terminals: only
 * div/span/pre/br). Then a Markdown-looking text/plain is the better source.
 */
export function htmlIsPlainish(html: string): boolean {
  if (isEditorHtml(html)) return false;
  return !/<(?:h[1-6]|ul|ol|li|table|blockquote|strong|b|em|i|u|a)[\s>]/i.test(html);
}

/**
 * Plain text from the quick composer → Markdown the editor loads. Lines stay lines (soft breaks
 * render as line breaks), blank lines separate paragraphs, ☐/☑ lines become task items. With
 * `titleFirstLine`, a plain first line becomes the note's Title heading (as in Apple Notes).
 */
export function plainTextToMarkdown(text: string, opts: { titleFirstLine?: boolean } = {}): string {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const trimmed = line.replace(/\s+$/, "");
      const m = checkboxPrefix(trimmed);
      if (m && !/^\s*[-*+]\s+\[/.test(trimmed)) return `- [${m.checked ? "x" : " "}] ${trimmed.slice(m.length)}`;
      return trimmed;
    });
  if (opts.titleFirstLine) {
    const first = lines.findIndex((l) => l.trim());
    const line = lines[first];
    // Only a plain line: lists, headings and quotes keep their own shape.
    if (line !== undefined && !/^\s*(?:#{1,6}\s|[-*+]\s|\d{1,3}[.)]\s|>)/.test(line)) {
      lines[first] = `# ${line.trim()}`;
      if (lines[first + 1]?.trim()) lines.splice(first + 1, 0, ""); // the body starts as its own paragraph
    }
  }
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
