/**
 * Which person a note is filed under. Deterministic rules first; unclear notes go to a filing
 * packet for a subagent (or Jakob).
 *   1. name/alias in the title ("Kava z Blažem", "Call x Ingo")
 *   2. a person-named folder ("Peter")
 *   3. only one person in the note
 *   4. clearly highest salience (v2) / the main candidate of a v1 "person" note
 * list notes → every person gets a "listed" excerpt; journal notes → "excerpt" per person.
 */
import { isJournalFolder } from "./folders";
import { deaccent, isInitial, lemmaCandidates, nameTokens, nicknameCanon } from "./names";

export type FilingPerson = { proposalId: string; key: string; displayName: string; aliases: string[]; status: string; disposition: string };
export type FilingMention = { mentionId: string; candidateIndex: number | null; surface: string; salience: number | null; confidence: number; person: FilingPerson | null; dismissed: boolean };
export type FilingInput = {
  itemId: string;
  title: string | null;
  folders: string[];
  classification: string | null;
  extractionVersion: number;
  mentions: FilingMention[];
  /** Person-named folder of this note (if any) and the people known under that name across all notes. */
  personFolder: string | null;
  folderCandidates: FilingPerson[];
};
export type FilingDecision =
  | { mode: "primary"; primaryMentionId: string; person: FilingPerson; rule: "title" | "folder" | "single" | "salience" | "v1-main" | "packet"; reason: string }
  | { mode: "primary-folder"; person: FilingPerson; rule: "folder"; reason: string }
  | { mode: "list" | "journal"; reason: string }
  | { mode: "dismiss"; reason: string }
  | { mode: "unclear"; reason: string }
  | { mode: "pending"; reason: string };

const fold = (s: string) => deaccent(s).toLowerCase();

/** Lemma set of the title words (so "z Blažem" matches Blaž). */
function titleLemmas(title: string | null): Set<string> {
  const out = new Set<string>();
  if (!title) return out;
  for (const w of title.split(/[\s,;:/()+&|–-]+/).filter(Boolean)) for (const l of lemmaCandidates(w)) out.add(fold(l));
  return out;
}

function personTokens(p: FilingPerson, surfaces: string[]) {
  const toks = new Set<string>();
  for (const n of [p.displayName, ...p.aliases, ...surfaces]) for (const t of nameTokens(n)) if (t.length >= 3 && !isInitial(t)) toks.add(t);
  return toks;
}

export function isFileable(p: FilingPerson | null): p is FilingPerson {
  return !!p && p.disposition === "person" && p.status !== "rejected";
}

export function decideFiling(input: FilingInput): FilingDecision {
  const unresolved = input.mentions.filter((m) => !m.person && !m.dismissed);
  if (unresolved.length) return { mode: "pending", reason: `${unresolved.length} mention(s) not resolved yet` };

  const people = new Map<string, { person: FilingPerson; mentions: FilingMention[] }>();
  for (const m of input.mentions) {
    if (!isFileable(m.person)) continue;
    const e = people.get(m.person.proposalId) ?? { person: m.person, mentions: [] };
    e.mentions.push(m);
    people.set(m.person.proposalId, e);
  }
  const best = (e: { mentions: FilingMention[] }) => [...e.mentions].sort((a, b) => (b.salience ?? 0) - (a.salience ?? 0) || b.confidence - a.confidence)[0]!;

  if (input.classification === "journal" || isJournalFolder(input.folders)) {
    return people.size ? { mode: "journal", reason: "diary note → excerpts per person" } : { mode: "dismiss", reason: "journal:no-people" };
  }
  if (input.classification === "list") {
    return people.size ? { mode: "list", reason: "list note → listed excerpt per person" } : { mode: "dismiss", reason: "list:no-people" };
  }
  if (!people.size) {
    if (input.personFolder && input.folderCandidates.length === 1 && isFileable(input.folderCandidates[0]!)) {
      return { mode: "primary-folder", person: input.folderCandidates[0]!, rule: "folder", reason: `folder “${input.personFolder}”` };
    }
    return { mode: "dismiss", reason: "no-people" };
  }

  // 1. Title
  const tl = titleLemmas(input.title);
  if (tl.size) {
    const hits = [...people.values()].filter((e) => [...personTokens(e.person, e.mentions.map((m) => m.surface))].some((t) => tl.has(t)));
    if (hits.length === 1) return { mode: "primary", primaryMentionId: best(hits[0]!).mentionId, person: hits[0]!.person, rule: "title", reason: `name in title “${input.title}”` };
    if (hits.length > 1) {
      // Prefer the one whose first AND last name are both in the title.
      const full = hits.filter((e) => {
        const t = nameTokens(e.person.displayName).filter((x) => !isInitial(x));
        return t.length >= 2 && t.every((x) => tl.has(x));
      });
      if (full.length === 1) return { mode: "primary", primaryMentionId: best(full[0]!).mentionId, person: full[0]!.person, rule: "title", reason: `full name in title “${input.title}”` };
    }
  }

  // 2. Person-named folder
  if (input.personFolder) {
    const f = fold(input.personFolder);
    const canon = nicknameCanon(f);
    const hits = [...people.values()].filter((e) => {
      const first = nameTokens(e.person.displayName)[0];
      return !!first && (first === f || nicknameCanon(first) === canon || e.person.aliases.some((a) => nameTokens(a)[0] === f));
    });
    if (hits.length === 1) return { mode: "primary", primaryMentionId: best(hits[0]!).mentionId, person: hits[0]!.person, rule: "folder", reason: `folder “${input.personFolder}”` };
  }

  // 3. Single person
  if (people.size === 1) {
    const e = [...people.values()][0]!;
    return { mode: "primary", primaryMentionId: best(e).mentionId, person: e.person, rule: "single", reason: "only person in the note" };
  }

  // 4. Salience
  const ranked = [...people.values()].map((e) => ({ e, s: Math.max(...e.mentions.map((m) => m.salience ?? -1)) })).sort((a, b) => b.s - a.s);
  if (ranked[0]!.s >= 0.7 && ranked[0]!.s - (ranked[1]?.s ?? 0) >= 0.2) {
    return { mode: "primary", primaryMentionId: best(ranked[0]!.e).mentionId, person: ranked[0]!.e.person, rule: "salience", reason: `salience ${ranked[0]!.s.toFixed(2)} vs ${(ranked[1]?.s ?? 0).toFixed(2)}` };
  }
  if (input.extractionVersion === 1 && input.classification === "person") {
    const main = input.mentions.find((m) => m.candidateIndex === 0 && isFileable(m.person));
    if (main && input.mentions.every((m) => m === main || m.confidence <= main.confidence)) {
      return { mode: "primary", primaryMentionId: main.mentionId, person: main.person!, rule: "v1-main", reason: "main candidate of a person note" };
    }
  }
  return { mode: "unclear", reason: `${people.size} people, no title/folder/salience signal` };
}
