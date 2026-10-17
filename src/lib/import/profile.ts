import { ProfileProposal, type ProfileProposal as Profile } from "./contracts";

const uniq = (xs: string[]) => {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = x.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
const minDate = (a: string | null, b: string | null) => (!a ? b : !b ? a : a < b ? a : b);
const maxDate = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

/** Reads a stored profile (jsonb) leniently. */
export function readProfile(raw: unknown): Profile {
  const p = ProfileProposal.safeParse(raw ?? {});
  if (p.success) return p.data;
  // Keep whatever parses field by field rather than dropping the whole profile.
  const out = ProfileProposal.parse({});
  const r = (raw ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(out) as (keyof Profile)[]) {
    const single = ProfileProposal.pick({ [k]: true } as never).safeParse({ [k]: r[k] });
    if (single.success) (out as Record<string, unknown>)[k] = (single.data as Record<string, unknown>)[k];
  }
  return out;
}

/** Merges two profiles of the same person: `a` wins scalars, arrays are unioned, key facts ≤8. */
export function mergeProfiles(a: Profile, b: Profile): Profile {
  return {
    role: a.role ?? b.role,
    company: a.company ?? b.company,
    city: a.city ?? b.city,
    country: a.country ?? b.country,
    metContext: a.metContext ?? b.metContext,
    metDate: a.metDate ?? b.metDate,
    metCity: a.metCity ?? b.metCity,
    warmth: a.warmth ?? b.warmth,
    circle: a.circle ?? b.circle,
    categories: [...new Set([...a.categories, ...b.categories])],
    activities: uniq([...a.activities, ...b.activities]),
    tags: uniq([...a.tags, ...b.tags]),
    keyFacts: uniq([...a.keyFacts, ...b.keyFacts]).slice(0, 8),
    howICanHelp: a.howICanHelp ?? b.howICanHelp,
    whatICanAsk: a.whatICanAsk ?? b.whatICanAsk,
    links: uniq([...a.links, ...b.links]),
    introducedByKey: a.introducedByKey ?? b.introducedByKey,
    followUps: [...a.followUps, ...b.followUps.filter((f) => !a.followUps.some((x) => x.what.toLowerCase() === f.what.toLowerCase()))],
    firstSeen: minDate(a.firstSeen, b.firstSeen),
    lastSeen: maxDate(a.lastSeen, b.lastSeen),
  };
}
