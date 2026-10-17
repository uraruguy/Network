/**
 * Turns free text typed by a person (or an AI tool) into a safe Postgres `tsquery` string for the
 * `public.network` text search configuration. Pure; unit-tested.
 *
 *   ana ljubljana        → 'ana':* & 'ljubljana':*      every word, prefix-matched (search-as-you-type,
 *                                                       and Slovenian inflections: "ljubljan" ⊂ "ljubljani")
 *   "board games"        → ('board' <-> 'games')        quoted phrase, exact word order
 *   climbing -gym        → 'climbing':* & !'gym':*      exclusion (only alongside a positive term)
 *   startup OR founder   → 'startup':* | 'founder':*    alternatives (upper-case OR)
 *
 * Words are reduced to letters and digits, so tsquery operators in the input can never reach
 * Postgres; each lexeme is additionally single-quoted with quotes/backslashes escaped.
 * Accents are left to the database (the config runs `unaccent`).
 */

const MAX_TERMS = 12;
const MAX_TERM_LENGTH = 64;

type Term = { words: string[]; phrase: boolean; negated: boolean };

/** Splits into letter/digit runs (Unicode-aware), lower-cased. */
export function words(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).map((w) => w.slice(0, MAX_TERM_LENGTH));
}

function lexeme(word: string, prefix: boolean) {
  const quoted = `'${word.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
  return prefix ? `${quoted}:*` : quoted;
}

function tokenize(input: string): (Term | "OR")[] {
  const out: (Term | "OR")[] = [];
  const re = /(-?)"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m[2] !== undefined) {
      const ws = words(m[2]);
      if (ws.length) out.push({ words: ws, phrase: true, negated: m[1] === "-" });
      continue;
    }
    const raw = m[3]!;
    if (raw === "OR") {
      out.push("OR");
      continue;
    }
    const negated = raw.startsWith("-") && raw.length > 1;
    // "e-mail" or "ana.kovac" become several words that must all match.
    for (const w of words(negated ? raw.slice(1) : raw)) out.push({ words: [w], phrase: false, negated });
  }
  return out;
}

function render(t: Term) {
  if (t.phrase && t.words.length > 1) return `(${t.words.map((w) => lexeme(w, false)).join(" <-> ")})`;
  return lexeme(t.words[0]!, !t.phrase);
}

/** Builds the tsquery text, or null when the input has nothing searchable. */
export function toTsQuery(input: string | null | undefined): string | null {
  if (!input) return null;
  const tokens = tokenize(input.slice(0, 1000));
  const groups: string[] = []; // AND-joined; each group may be an OR chain
  let positives = 0;
  let pendingOr = false;
  let count = 0;
  for (const tok of tokens) {
    if (tok === "OR") {
      pendingOr = groups.length > 0;
      continue;
    }
    if (count >= MAX_TERMS) break;
    count++;
    if (!tok.negated) positives++;
    const piece = (tok.negated ? "!" : "") + render(tok);
    if (pendingOr && !tok.negated) groups[groups.length - 1] = `${groups[groups.length - 1]} | ${piece}`;
    else groups.push(piece);
    pendingOr = false;
  }
  if (!positives) return null;
  return groups.map((g) => (g.includes(" | ") ? `(${g})` : g)).join(" & ");
}

/** `%text%` for ILIKE / trigram matching, with LIKE wildcards escaped. */
export function likePattern(text: string): string {
  return `%${text.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
