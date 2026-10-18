/** Small text helpers shared by server and client. Pure. */

/** Lower-case and strip diacritics ("Čevapi" → "cevapi") for accent-insensitive matching. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Lookup key for a taxonomy name (activities, tags): case- and accent-insensitive and blind to
 * emoji, so "🥾 Hiking" (how the model sees an activity) finds "Hiking". Emoji-only names keep
 * their emoji so they can't all collapse to the same empty key.
 */
export function nameKey(s: string): string {
  const letters = s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, "").replace(/\s+/g, " ").trim();
  return fold(letters || s.trim());
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
