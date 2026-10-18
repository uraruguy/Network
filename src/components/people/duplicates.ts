/**
 * Duplicate people: spotting likely duplicates in the index, and the wording of a merge preview
 * (from mergePeople's report). Pure; unit-tested in duplicates.test.ts.
 */
import type { MergeReport } from "@/lib/queries/people";
import { fold } from "@/lib/text";

/** "Vid  Čanabrian" and "čanabrian, vid" → "canabrian vid": case, accents, punctuation and word order don't count. */
export function nameKey(name: string): string {
  return fold(name)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");
}

/** Stable id of one duplicate group (its member ids), for "Not the same person". Changes when someone joins it. */
export const groupKey = (group: readonly { id: string }[]) =>
  group
    .map((p) => p.id)
    .sort()
    .join("+");

type Dupe = { id: string; displayName: string; createdAt?: Date | string | null };

const time = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : Infinity);

/**
 * People sharing a normalized name, two or more per group, oldest card first (usually the one
 * worth keeping). Groups the owner dismissed (`groupKey`) are left out; order is by name.
 */
export function likelyDuplicates<T extends Dupe>(people: readonly T[], dismissed: ReadonlySet<string> = new Set()): T[][] {
  const byKey = new Map<string, T[]>();
  for (const p of people) {
    const k = nameKey(p.displayName);
    if (!k) continue;
    const list = byKey.get(k);
    if (list) list.push(p);
    else byKey.set(k, [p]);
  }
  return [...byKey.entries()]
    .filter(([, g]) => g.length > 1 && !dismissed.has(groupKey(g)))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, g]) => [...g].sort((a, b) => time(a.createdAt) - time(b.createdAt) || a.id.localeCompare(b.id)));
}

/** What a merge moves, in the order the preview lists it. Keys are mergePeople's `moved` counters. */
export const MOVED_LABELS = [
  ["notes", "Notes"],
  ["reminders", "Follow-ups"],
  ["mentions", "Mentions"],
  ["introduced", "Introductions"],
  ["chat_threads", "Chats"],
  ["person_categories", "Categories"],
  ["person_tags", "Tags"],
  ["person_activities", "Activities"],
] as const;

export type MovedKind = (typeof MOVED_LABELS)[number][0];

/** Non-zero moves as `{ kind, label, count }` (import bookkeeping is left out). */
export function movedRows(moved: Record<string, number>) {
  return MOVED_LABELS.flatMap(([kind, label]) => ((moved[kind] ?? 0) > 0 ? [{ kind, label, count: moved[kind]! }] : []));
}

/** "3 notes · 1 follow-up" — for the toast after a merge. Empty when nothing moved. */
export function movedSummary(moved: Record<string, number>): string {
  return movedRows(moved)
    .map(({ label, count }) => `${count} ${count === 1 ? singular(label) : label.toLowerCase()}`)
    .join(" · ");
}

const singular = (label: string) => (label === "Categories" ? "category" : label === "Activities" ? "activity" : label.slice(0, -1).toLowerCase());

/** mergePeople's filled field names → what the owner calls them. */
const FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  avatarUrl: "Photo",
  headline: "Role",
  company: "Company",
  homeLocationId: "Home city",
  metContext: "How you met",
  metAt: "Met on",
  metLocationId: "Met in",
  introducedById: "Introduced by",
  circle: "Circle",
  email: "Email",
  phone: "Phone",
  linkedin: "LinkedIn",
  xHandle: "X",
  instagram: "Instagram",
  website: "Website",
  birthday: "Birthday",
  howICanHelp: "How I can help",
  whatICanAsk: "What I can ask",
  followupCadenceDays: "Follow-up rhythm",
  languages: "Languages",
  interests: "Interests",
};

/** Filled-in details, labelled, in FIELD_LABELS order; legacy and bookkeeping fields (hobbies, last interaction) are left out. */
export function filledFields(fields: readonly string[]): string[] {
  const set = new Set(fields);
  return Object.entries(FIELD_LABELS).flatMap(([f, label]) => (set.has(f) ? [label] : []));
}

/** "Company, Email and Languages". */
export function listJoin(items: readonly string[]): string {
  if (items.length < 2) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** How much a card holds, read from the dry run that would merge it away (its notes and follow-ups move). */
export function cardCounts(report: Pick<MergeReport, "moved" | "factsMerged"> | undefined) {
  if (!report) return null;
  return { notes: (report.moved.notes ?? 0) + (report.factsMerged ? 1 : 0), followUps: report.moved.reminders ?? 0 };
}
