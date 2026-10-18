/**
 * Display text for the review screen (pure): review flags as plain sentences, name highlighting
 * in evidence snippets, and small label helpers.
 */

/* ------------------------------------------------------------------ */
/*  Flags                                                              */
/* ------------------------------------------------------------------ */

export type FlagInput = {
  reviewFlags: string[];
  reasons: string | null;
  matchPerson: { displayName: string | null } | null;
  similar: { kind: "person" | "proposal"; displayName: string }[];
  disposition: string;
  confidence: number | null;
  mentionCount: number;
};

export type FlagSentence = { key: string; text: string; tone: "info" | "warn" };

/** "Blaž from SF [possible same as: Blaž Novak, Blaž K.]" → ["Blaž Novak", "Blaž K."] */
export function possibleSameAs(reasons: string | null): string[] {
  if (!reasons) return [];
  const out: string[] = [];
  for (const m of reasons.matchAll(/\[possible same as:\s*([^\]]+)\]/gi)) out.push(...m[1]!.split(",").map((s) => s.trim()).filter(Boolean));
  return [...new Set(out)];
}

/** Review flags as short plain sentences, most useful first. */
export function flagSentences(p: FlagInput): FlagSentence[] {
  const out: FlagSentence[] = [];
  const flags = new Set(p.reviewFlags);
  if (p.disposition === "passerby") out.push({ key: "passerby", text: "Looks like a passer-by", tone: "warn" });
  if (p.disposition === "not_person") out.push({ key: "not_person", text: "Might not be a person", tone: "warn" });
  if (p.disposition === "self" || flags.has("self_uncertain")) out.push({ key: "self", text: "Might be you", tone: "warn" });
  if (flags.has("possible_duplicate")) {
    const same = possibleSameAs(p.reasons);
    const name = same[0] ?? p.similar.find((s) => s.kind === "proposal")?.displayName ?? p.similar[0]?.displayName;
    out.push({ key: "possible_duplicate", text: name ? `Maybe the same as ${name}${same.length > 1 ? ` or ${same.length - 1} more` : ""}` : "Maybe a duplicate of someone else", tone: "warn" });
  }
  if (flags.has("existing_match_uncertain")) {
    const name = p.matchPerson?.displayName;
    out.push({ key: "existing_match_uncertain", text: name ? `Might already be in The Network as ${name}` : "Might already be in The Network", tone: "warn" });
  }
  if (flags.has("first_name_only")) out.push({ key: "first_name_only", text: "First name only", tone: "info" });
  if (flags.has("ambiguous_first_name")) out.push({ key: "ambiguous_first_name", text: "Several people share this first name", tone: "info" });
  if (flags.has("split_candidate")) out.push({ key: "split_candidate", text: "Might be two different people", tone: "warn" });
  if (flags.has("conflicting_facts")) out.push({ key: "conflicting_facts", text: "The notes disagree on some facts", tone: "warn" });
  if (flags.has("gender_conflict")) out.push({ key: "gender_conflict", text: "The notes disagree on he / she", tone: "info" });
  if (flags.has("low_evidence") || (p.mentionCount <= 1 && !flags.size && (p.confidence ?? 1) < 0.85)) out.push({ key: "low_evidence", text: p.mentionCount <= 1 ? "Mentioned only once, briefly" : "Only brief mentions", tone: "info" });
  if (flags.has("stale")) out.push({ key: "stale", text: "A note changed since this was proposed", tone: "info" });
  if (flags.has("user_attention") && out.length === 0) out.push({ key: "user_attention", text: "Claude wasn’t sure about this one", tone: "info" });
  return out;
}

/* ------------------------------------------------------------------ */
/*  Highlighting                                                       */
/* ------------------------------------------------------------------ */

const FOLD_CHAR: Record<string, string> = { đ: "d", Đ: "d", ø: "o", Ø: "o", ł: "l", Ł: "l", æ: "a", Æ: "a", œ: "o", Œ: "o", ß: "s" };

/** Folds one character to a single lowercase base letter (length-preserving, so indices line up). */
function foldChar(c: string): string {
  const mapped = FOLD_CHAR[c];
  if (mapped) return mapped;
  const base = c.normalize("NFD").replace(/\p{M}/gu, "");
  return (base[0] ?? c).toLowerCase();
}

export function foldKeepLength(s: string): string {
  let out = "";
  for (const c of s) {
    const f = foldChar(c);
    // Astral characters keep their UTF-16 length so offsets stay aligned.
    out += c.length === 2 ? `${f}\u0000` : f;
  }
  return out;
}

export type Segment = { text: string; hit: boolean };

const isLetter = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/**
 * Splits `text` into plain and highlighted segments for any of `terms` (diacritic- and
 * case-insensitive, whole-word starts). A hit extends over a short inflected ending, so the stem
 * "Blaž" highlights all of "Blažem" and "Kaja" highlights "Kajo".
 */
export function highlightSegments(text: string, terms: string[]): Segment[] {
  const folded = foldKeepLength(text);
  const needles = [...new Set(terms.flatMap((t) => [t, ...t.split(/\s+/)]).map((t) => foldKeepLength(t.trim())).filter((t) => t.length >= 2))].sort((a, b) => b.length - a.length);
  if (!needles.length || !text) return text ? [{ text, hit: false }] : [];
  const marks: [number, number][] = [];
  for (const n of needles) {
    // Inflected forms drop the stem's final vowel (Kaja → Kajo, Miha → Miho), so also try the stem without it.
    const variants = n.length >= 4 && /[aeiou]$/.test(n) ? [n, n.slice(0, -1)] : [n];
    for (const v of variants) {
      let from = 0;
      for (;;) {
        const at = folded.indexOf(v, from);
        if (at < 0) break;
        from = at + 1;
        if (isLetter(text[at - 1])) continue;
        let end = at + v.length;
        let extra = 0;
        while (isLetter(text[end]) && extra < 3) {
          end++;
          extra++;
        }
        if (isLetter(text[end])) continue; // a different, longer word
        if (!marks.some(([s, e]) => at < e && end > s)) marks.push([at, end]);
      }
    }
  }
  marks.sort((a, b) => a[0] - b[0]);
  const out: Segment[] = [];
  let pos = 0;
  for (const [s, e] of marks) {
    if (s > pos) out.push({ text: text.slice(pos, s), hit: false });
    out.push({ text: text.slice(s, e), hit: true });
    pos = e;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), hit: false });
  return out;
}

/** Trims a long snippet around its first highlighted term. */
export function focusSnippet(text: string, terms: string[], max = 220): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const segs = highlightSegments(clean, terms);
  let at = 0;
  for (const s of segs) {
    if (s.hit) break;
    at += s.text.length;
  }
  const start = Math.max(0, Math.min(at - Math.floor(max / 3), clean.length - max));
  const slice = clean.slice(start, start + max).trim();
  return `${start > 0 ? "…" : ""}${slice}${start + max < clean.length ? "…" : ""}`;
}

/* ------------------------------------------------------------------ */
/*  Labels                                                             */
/* ------------------------------------------------------------------ */

export const SOURCE_LABELS: Record<string, string> = { "apple-notes": "Apple Notes", paste: "Pasted notes" };
export const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** "Ljubljana, SI" from a geocoded place, else the raw city text. */
export function placeLabel(place: { name: string; countryCode: string } | null, rawCity: string | null): string | null {
  if (place) return `${place.name}, ${place.countryCode}`;
  return rawCity?.trim() || null;
}

/** Name for avatar initials: drops parentheticals ("Marko (natakar)" → "Marko"). */
export const avatarName = (n: string) => n.replace(/\([^)]*\)/g, "").trim() || n;

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;
