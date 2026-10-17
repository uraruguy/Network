/**
 * Mention records: one per extracted candidate (v1 or v2 extraction), with the evidence a
 * resolver needs (snippets around the name, co-mentions, folders, date, gender hint).
 */
import { CandidateV2, ExtractionV1, type MentionRecord } from "./contracts";
import { isoDay, noteDate } from "./dates";
import { deaccent, genderHint, isInitial, lemmaCandidates, nameTokens } from "./names";

export type ItemForMentions = {
  id: string;
  title: string | null;
  text: string;
  folders: string[];
  created: Date | null;
  classification: string | null;
  extractionVersion: number | null;
  candidates: unknown;
};

export type NormalizedCandidate = Omit<CandidateV2, "salience"> & { index: number; salience: number | null };
export type NormalizedExtraction = { occurredAt: string | null; noteSummary: string | null; suggestedTitle: string | null; version: number; candidates: NormalizedCandidate[] };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const LEGACY_HOBBY_TO_ACTIVITY: Record<string, string> = { football: "football", skiing: "skiing", hiking: "hiking", running: "running", padel: "padel", partying: "partying", coffee: "coffee", lunch: "lunch", gym: "gym" };

/** Reads import_items.candidates (v1 or v2) into one normalised shape. */
export function normalizeExtraction(raw: unknown, version: number | null): NormalizedExtraction {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (version === 2 || r.version === 2) {
    const cands = Array.isArray(r.candidates) ? r.candidates : [];
    return {
      occurredAt: typeof r.occurredAt === "string" ? r.occurredAt : null,
      noteSummary: typeof r.noteSummary === "string" ? r.noteSummary : null,
      suggestedTitle: typeof r.suggestedTitle === "string" ? r.suggestedTitle : null,
      version: 2,
      candidates: cands.flatMap((c, index) => {
        const p = CandidateV2.safeParse(c);
        return p.success ? [{ ...p.data, index }] : [];
      }),
    };
  }
  const v1 = ExtractionV1.safeParse(raw ?? {});
  const ex = v1.success ? v1.data : { candidates: [], occurredAt: null, noteSummary: null, suggestedTitle: null };
  return {
    occurredAt: ex.occurredAt ?? null,
    noteSummary: ex.noteSummary ?? null,
    suggestedTitle: ex.suggestedTitle ?? null,
    version: 1,
    candidates: ex.candidates.map((c, index) => ({
      index,
      name: c.name,
      aliases: c.aliases,
      surfaces: [],
      gender: null,
      salience: null,
      role: c.role ?? null,
      company: c.company ?? null,
      city: c.city ?? null,
      country: c.country ?? null,
      metContext: c.metContext ?? null,
      metDate: c.metDate ?? null,
      metCity: c.metCity ?? null,
      categories: c.categories.filter((x): x is CandidateV2["categories"][number] => ["mentor", "friend", "partner", "investor", "client", "founder", "acquaint"].includes(x)),
      warmth: (["inner", "active", "dormant", "archive"].includes(c.warmth ?? "") ? c.warmth : null) as CandidateV2["warmth"],
      circle: (["nice_to_know", "hang_out_more", "potential_close"].includes(c.circle ?? "") ? c.circle : null) as CandidateV2["circle"],
      activities: c.hobbies.map((h) => LEGACY_HOBBY_TO_ACTIVITY[h]).filter((x): x is string => !!x),
      introducedBy: c.introducedBy ?? null,
      keyFacts: c.keyFacts,
      howICanHelp: c.howICanHelp ?? null,
      whatICanAsk: c.whatICanAsk ?? null,
      followUps: c.followUps.map((f) => ({ what: f.what, when: f.when ?? null, explicitDate: f.when && ISO.test(f.when) ? f.when : null })),
      links: c.links,
      excerpt: null,
      confidence: c.confidence,
    })),
  };
}

const fold = (s: string) => deaccent(s).toLowerCase();
const WORD_RE = /[\p{L}][\p{L}'’-]*/gu;

/** Accent-folded name tokens a text word may match (directly or after lemmatising the word). */
export function variantSet(names: string[]): Set<string> {
  const v = new Set<string>();
  for (const n of names) for (const t of nameTokens(n)) if (t.length >= 3 && !isInitial(t)) v.add(t);
  return v;
}

/** Character offsets of words in `text` that refer to one of the name variants. */
export function findNameHits(text: string, variants: Set<string>): { index: number; word: string }[] {
  if (!variants.size) return [];
  const hits: { index: number; word: string }[] = [];
  for (const m of text.matchAll(WORD_RE)) {
    const w = m[0];
    const f = fold(w);
    if (variants.has(f) || lemmaCandidates(w).some((l) => variants.has(fold(l)))) hits.push({ index: m.index!, word: w });
  }
  return hits;
}

/** Up to `max` non-overlapping ±radius snippets around hits, verbatim (with … markers). */
export function snippetsAround(text: string, hits: { index: number }[], max = 2, radius = 200): string[] {
  const out: string[] = [];
  let lastEnd = -1;
  for (const h of hits) {
    if (out.length >= max) break;
    const start = Math.max(0, h.index - radius);
    if (start < lastEnd) continue;
    const end = Math.min(text.length, h.index + radius);
    out.push(`${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`);
    lastEnd = end;
  }
  return out;
}

/**
 * A verbatim excerpt about the person: the model's excerpt when it really is a substring of the
 * note, else the paragraph/line around the first name hit (≤600 chars), else null.
 */
export function verbatimExcerpt(text: string, proposed: string | null | undefined, hitIndex: number | null, max = 600): string | null {
  if (proposed) {
    const p = proposed.trim();
    if (p && text.includes(p)) return p.length > max * 2 ? p.slice(0, max * 2) : p;
  }
  if (hitIndex == null) return null;
  const around = (sep: RegExp) => {
    let start = 0;
    for (const m of text.slice(0, hitIndex).matchAll(sep)) start = m.index! + m[0].length;
    const rest = text.slice(hitIndex).search(sep);
    const end = rest < 0 ? text.length : hitIndex + rest;
    return { start, end };
  };
  // Paragraph first (blank-line separated); a long paragraph (e.g. a whole list) → just the line.
  let { start, end } = around(/\n\s*\n/g);
  if (end - start > max) ({ start, end } = around(/\n/g));
  let ex = text.slice(start, end);
  if (ex.length > max) {
    const rel = hitIndex - start;
    const s = Math.max(0, Math.min(rel - Math.floor(max / 3), ex.length - max));
    ex = ex.slice(s, s + max);
  }
  ex = ex.trim();
  return ex && text.includes(ex) ? ex : null;
}

export function noteFileName(itemId: string) {
  return `notes/${itemId}.md`;
}

/** Builds one mention record per candidate across the given items. */
export function buildMentions(items: ItemForMentions[]): MentionRecord[] {
  const out: MentionRecord[] = [];
  for (const it of items) {
    const ex = normalizeExtraction(it.candidates, it.extractionVersion);
    const nd = noteDate({ title: it.title, occurredAt: ex.occurredAt, created: it.created });
    const names = ex.candidates.map((c) => c.name);
    for (const c of ex.candidates) {
      const variants = variantSet([c.name, ...c.aliases, ...c.surfaces]);
      const hits = findNameHits(it.text, variants);
      const genders = hits.slice(0, 6).map((h) => genderHint(it.text, h.index)).filter(Boolean);
      const gh = genders.length ? (genders.filter((g) => g === "f").length > genders.length / 2 ? "f" : genders.filter((g) => g === "m").length > genders.length / 2 ? "m" : null) : null;
      const lemmas = [...new Set(nameTokens(c.name).flatMap((t) => lemmaCandidates(t).map(fold)))];
      out.push({
        mentionId: `${it.id}:${c.index}`,
        itemId: it.id,
        index: c.index,
        surface: c.name,
        aliases: [...new Set([...c.aliases, ...c.surfaces.filter((s) => s !== c.name)])].slice(0, 8),
        lemmas,
        folders: it.folders,
        title: it.title,
        date: isoDay(nd.date),
        classification: it.classification,
        extractionVersion: ex.version,
        role: c.role,
        company: c.company,
        city: c.city,
        categories: c.categories,
        keyFacts: c.keyFacts.slice(0, 3),
        salience: c.salience,
        gender: c.gender,
        genderHint: gh,
        coMentions: names.filter((n, i) => i !== c.index).slice(0, 12),
        snippets: snippetsAround(it.text, hits),
        excerpt: verbatimExcerpt(it.text, c.excerpt, hits[0]?.index ?? null),
        confidence: c.confidence,
        noteFile: noteFileName(it.id),
      });
    }
  }
  return out;
}
