import type { CandidateV2 } from "./contracts";
import { lemmaCandidates, nameTokens, normName } from "./names";

const uniq = <T>(xs: T[]) => [...new Set(xs)];
const uniqBy = <T>(xs: T[], k: (x: T) => string) => {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const key = k(x);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

function sameName(a: string, b: string) {
  const na = normName(a);
  const nb = normName(b);
  if (na === nb) return true;
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  // "Blaž" vs "Blaž Novak" in different chunks: same first name, one side has no surname.
  if (ta.length === 1 || tb.length === 1) {
    const la = new Set(lemmaCandidates(ta[0] ?? "").map(normName));
    return lemmaCandidates(tb[0] ?? "").some((l) => la.has(normName(l))) && (ta.length === 1) !== (tb.length === 1);
  }
  return false;
}

/** Merges candidates extracted from several chunks of one note (same person → one candidate). */
export function mergeChunkCandidates(lists: CandidateV2[][]): CandidateV2[] {
  const out: CandidateV2[] = [];
  for (const list of lists) {
    for (const c of list) {
      const hit = out.find((o) => sameName(o.name, c.name));
      if (!hit) {
        out.push({ ...c });
        continue;
      }
      const longer = nameTokens(c.name).length > nameTokens(hit.name).length ? c.name : hit.name;
      const shorter = longer === c.name ? hit.name : c.name;
      hit.name = longer;
      hit.aliases = uniq([...hit.aliases, ...c.aliases, ...(shorter !== longer ? [shorter] : [])]).filter((a) => a !== hit.name);
      hit.surfaces = uniq([...hit.surfaces, ...c.surfaces]);
      hit.gender ??= c.gender;
      hit.salience = Math.max(hit.salience, c.salience);
      for (const k of ["role", "company", "city", "country", "metContext", "metDate", "metCity", "warmth", "circle", "introducedBy", "howICanHelp", "whatICanAsk", "excerpt"] as const) {
        if (hit[k] == null && c[k] != null) (hit as Record<string, unknown>)[k] = c[k];
      }
      hit.categories = uniq([...hit.categories, ...c.categories]);
      hit.activities = uniq([...hit.activities, ...c.activities]);
      hit.keyFacts = uniq([...hit.keyFacts, ...c.keyFacts]).slice(0, 8);
      hit.followUps = uniqBy([...hit.followUps, ...c.followUps], (f) => f.what.toLowerCase());
      hit.links = uniq([...hit.links, ...c.links]);
      hit.confidence = Math.max(hit.confidence, c.confidence);
    }
  }
  return out;
}
