import { HOBBIES } from "@/lib/constants";
import type { Category } from "@/lib/db/schema";
import type { ActivityRow } from "@/lib/data/activities";
import type { PersonDetail as PersonDetailApi, PersonIndexRow } from "@/lib/data/people";

/**
 * Adapters from the v2 API shapes to the shapes the v1 screens still read (`categories` objects on
 * list rows, `hobbies`/`hobbiesOther`, note `contentText`). Pure; delete once the UI reads the v2
 * shapes directly.
 */

const LEGACY_HOBBIES = new Set<string>(HOBBIES.filter((h) => h !== "other"));

/** Activities expressed as v1 hobbies: known slugs as-is, everything else as "other" + names. */
export function legacyHobbies(activityIds: readonly string[] | undefined, activities: readonly Pick<ActivityRow, "id" | "slug" | "name">[]) {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const hobbies: string[] = [];
  const others: string[] = [];
  for (const id of activityIds ?? []) {
    const a = byId.get(id);
    if (!a) continue;
    if (LEGACY_HOBBIES.has(a.slug)) hobbies.push(a.slug);
    else others.push(a.name);
  }
  if (others.length) hobbies.push("other");
  return { hobbies, hobbiesOther: others.length ? others.join(", ") : null };
}

export type PersonListItem = PersonIndexRow & {
  categories: Category[];
  homeLocationId: string | null;
  hobbies: string[];
  hobbiesOther: string | null;
};

export function toPersonListItem(row: PersonIndexRow, categories: readonly Category[], activities: readonly ActivityRow[]): PersonListItem {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return {
    ...row,
    categories: (row.categoryIds ?? []).map((id) => byId.get(id)).filter((c): c is Category => !!c),
    homeLocationId: row.homeLocation?.id ?? null,
    ...legacyHobbies(row.activityIds, activities),
  };
}

type WithText<T> = T & { contentText: string };

export type PersonDetail = Omit<PersonDetailApi, "notes" | "mentions"> & {
  notes: WithText<PersonDetailApi["notes"][number]>[];
  mentions: { note: WithText<PersonDetailApi["mentions"][number]["note"]> }[];
  hobbies: string[];
  hobbiesOther: string | null;
};

export function toLegacyDetail(p: PersonDetailApi, activities: readonly ActivityRow[]): PersonDetail {
  return {
    ...p,
    notes: (p.notes ?? []).map((n) => ({ ...n, contentText: n.excerpt ?? "" })),
    mentions: (p.mentions ?? []).map((m) => ({ note: { ...m.note, contentText: m.note.excerpt ?? "" } })),
    ...legacyHobbies(p.activityIds, activities),
  };
}

/** Recent-note rows carry `excerpt`; the v1 NoteRow reads `contentText`. */
export function withContentText<T extends { excerpt?: string }>(n: T): T & { contentText: string } {
  return { ...n, contentText: n.excerpt ?? "" };
}

/** Accent-insensitive "contains" used for local filtering of the cached index. */
export function matchesText(row: Pick<PersonIndexRow, "displayName" | "company" | "headline">, foldedQuery: string, fold: (s: string) => string) {
  if (!foldedQuery) return true;
  return [row.displayName, row.company, row.headline].some((v) => v && fold(v).includes(foldedQuery));
}
