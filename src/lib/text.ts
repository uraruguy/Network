/** Small text helpers shared by server and client. Pure. */

/** Lower-case and strip diacritics ("Čevapi" → "cevapi") for accent-insensitive matching. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * URL-safe slug, accent-insensitive. Same result as the SQL helper `private.slugify()` for Latin
 * text ("Cross-country skiing" → "cross-country-skiing", "Čaj s prijatelji" → "caj-s-prijatelji").
 */
export function slugify(s: string): string {
  return fold(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Trims, collapses inner whitespace and de-duplicates case-insensitively, keeping the first spelling. */
export function cleanNames(names: readonly string[], maxLength = 60): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.replace(/\s+/g, " ").trim().slice(0, maxLength);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
