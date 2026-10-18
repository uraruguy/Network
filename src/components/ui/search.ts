/**
 * Diacritic- and case-insensitive matching for pickers and search fields:
 * "zan" finds "Žan", "lukic" finds "Lukić", "ostergaard" finds "Østergaard".
 */

/** Letters that NFD doesn't decompose into base + combining mark. */
const SPECIAL: Record<string, string> = {
  ø: "o",
  æ: "ae",
  œ: "oe",
  ß: "ss",
  đ: "d",
  ð: "d",
  ł: "l",
  þ: "th",
  ı: "i",
};
const SPECIAL_RE = new RegExp(`[${Object.keys(SPECIAL).join("")}]`, "g");

/** Lower-case, strip accents, collapse whitespace. */
export function normalizeForSearch(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(SPECIAL_RE, (ch) => SPECIAL[ch] ?? ch)
    .replace(/\s+/g, " ")
    .trim();
}

/** Every whitespace-separated query token occurs somewhere in `text`. Empty query matches all. */
export function matchesQuery(text: string, query: string): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  const hay = normalizeForSearch(text);
  return q.split(" ").every((token) => hay.includes(token));
}

/**
 * Match quality for sorting (lower is better): 0 exact, 1 whole-text prefix, 2 word prefix,
 * 3 substring, Infinity no match.
 */
export function matchRank(text: string, query: string): number {
  const q = normalizeForSearch(query);
  const hay = normalizeForSearch(text);
  if (!q) return 3;
  if (!matchesQuery(text, query)) return Infinity;
  if (hay === q) return 0;
  if (hay.startsWith(q)) return 1;
  if (hay.split(" ").some((w) => w.startsWith(q.split(" ")[0]!))) return 2;
  return 3;
}

/** Filter + rank `items` by `query` (stable for equal ranks). */
export function filterByQuery<T>(items: readonly T[], query: string, toText: (item: T) => string): T[] {
  if (!normalizeForSearch(query)) return [...items];
  return items
    .map((item, i) => ({ item, i, r: matchRank(toText(item), query) }))
    .filter((x) => x.r !== Infinity)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.item);
}
