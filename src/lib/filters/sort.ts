/**
 * People list ordering. Pure functions over index rows (dates may be ISO strings or Dates).
 * With a search query, better name matches float to the top and the chosen sort breaks ties.
 */
import { matchRank, normalizeForSearch } from "@/components/ui/search";
import { WARMTH } from "@/lib/constants";
import type { PeopleRow } from "./people-filters";

export const SORT_KEYS = ["recent", "name", "followup", "warmth"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const DEFAULT_SORT: SortKey = "recent";

export const SORT_META: Record<SortKey, { label: string; hint: string }> = {
  recent: { label: "Recent", hint: "Last interaction first" },
  name: { label: "Name", hint: "A to Z" },
  followup: { label: "Next follow-up", hint: "Soonest first" },
  warmth: { label: "Warmth", hint: "Inner circle first" },
};

export function parseSort(value: string | null | undefined): SortKey {
  return (SORT_KEYS as readonly string[]).includes(value ?? "") ? (value as SortKey) : DEFAULT_SORT;
}

/** Name collation: case- and accent-insensitive, numbers in natural order ("Žan" sorts with "Zan"). */
export const nameCollator = new Intl.Collator("en", { sensitivity: "base", numeric: true, ignorePunctuation: true });

const time = (v: string | Date | null | undefined): number | null => {
  if (!v) return null;
  const t = (v instanceof Date ? v : new Date(v)).getTime();
  return Number.isNaN(t) ? null : t;
};

const WARMTH_RANK = new Map<string, number>(WARMTH.map((w, i) => [w, i]));

type Keyed<T> = { row: T; last: number | null; created: number; next: number | null; rank: number };

/** Nulls always last, regardless of direction. */
const nullsLast = (a: number | null, b: number | null, dir: 1 | -1) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : (a - b) * dir);

const byName = <T extends PeopleRow>(a: Keyed<T>, b: Keyed<T>) => nameCollator.compare(a.row.displayName, b.row.displayName) || (a.row.id < b.row.id ? -1 : 1);

/** Most recent interaction first; people never interacted with sort by when they were added. */
const byRecent = <T extends PeopleRow>(a: Keyed<T>, b: Keyed<T>) =>
  nullsLast(a.last, b.last, -1) || b.created - a.created || byName(a, b);

const COMPARE: Record<SortKey, <T extends PeopleRow>(a: Keyed<T>, b: Keyed<T>) => number> = {
  recent: byRecent,
  name: byName,
  followup: (a, b) => nullsLast(a.next, b.next, 1) || byRecent(a, b),
  warmth: (a, b) => (WARMTH_RANK.get(a.row.warmth) ?? 9) - (WARMTH_RANK.get(b.row.warmth) ?? 9) || byRecent(a, b),
};

/** Comparator for two rows (convenience for tests / small lists; `sortPeople` is faster for many rows). */
export function comparePeople<T extends PeopleRow>(sort: SortKey): (a: T, b: T) => number {
  return (a, b) => COMPARE[sort](decorate(a), decorate(b));
}

function decorate<T extends PeopleRow>(row: T, query?: string): Keyed<T> {
  return {
    row,
    last: time(row.lastInteractionAt),
    created: time(row.createdAt) ?? 0,
    next: time(row.nextFollowupAt),
    rank: query ? Math.min(matchRank(row.displayName, query), 4) : 0,
  };
}

/**
 * Sorted copy of `rows`. With `query`, rows whose NAME matches better come first
 * (exact → prefix → word prefix → elsewhere, e.g. only the company matched), then `sort`.
 */
export function sortPeople<T extends PeopleRow>(rows: readonly T[], sort: SortKey, query?: string): T[] {
  const q = query?.trim() || undefined;
  const cmp = COMPARE[sort];
  return rows
    .map((r) => decorate(r, q))
    .sort((a, b) => (q ? a.rank - b.rank : 0) || cmp(a, b))
    .map((k) => k.row);
}

/** First letter for the A–Z index ("Žan" → "Z", "123" → "#"). */
export function indexLetter(name: string): string {
  const ch = normalizeForSearch(name).charAt(0).toUpperCase();
  return ch >= "A" && ch <= "Z" ? ch : "#";
}
