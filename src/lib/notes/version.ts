/**
 * Optimistic concurrency for note content (client + server, pure; unit-tested in version.test.ts).
 *
 * A content version is a hash of the stored text + Markdown — exactly what the server keeps, so
 * both sides compute the same token without a schema change. Content saves carry
 * `baseVersions`: the server versions the edited text may replace (the version the editor opened
 * plus every save already queued before this one, so any prefix of our own queue having landed
 * is fine). Hashing content rather than `updated_at` means pin/kind/date/move writes never
 * conflict, and a replay of a write that already landed is recognised as such.
 */

/** cyrb53: fast, well-distributed 53-bit string hash. Not cryptographic — a change detector. */
function cyrb53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export type VersionSource = { contentText?: string | null; contentMd?: string | null };

/** The version token of a note's stored content. */
export const contentVersion = (n: VersionSource) => `${(n.contentText ?? "").length.toString(36)}.${cyrb53(`${n.contentText ?? ""}\u0000${n.contentMd ?? ""}`)}`;

/** Most versions a save carries: the opened version plus the newest queued ones. */
export const MAX_BASE_VERSIONS = 32;

/** `chain` followed by `version` (deduped), capped by dropping the oldest after the first. */
export function extendChain(chain: readonly string[], version: string): string[] {
  const next = chain.includes(version) ? [...chain] : [...chain, version];
  return next.length > MAX_BASE_VERSIONS ? [next[0]!, ...next.slice(next.length - MAX_BASE_VERSIONS + 1)] : next;
}

export type ConflictCheck = {
  /** Versions the write may replace; empty/absent = unconditional (creates, pins, restores). */
  baseVersions?: readonly string[] | null;
  /** The note as stored now. */
  current: VersionSource;
  /** The content the write would store. */
  incoming: VersionSource;
};

/**
 * Server rule: a guarded write conflicts when the stored content is neither one it was based on
 * nor already the content it carries (a replay of a save that landed).
 */
export function isStaleWrite({ baseVersions, current, incoming }: ConflictCheck): boolean {
  if (!baseVersions?.length) return false;
  const now = contentVersion(current);
  return !baseVersions.includes(now) && now !== contentVersion({ contentText: incoming.contentText ?? current.contentText, contentMd: incoming.contentMd ?? current.contentMd });
}
