/**
 * The one-shot (v1) import's merge of a candidate into an existing person (pure): fill blanks only.
 */
import type { Candidate } from "@/lib/ai/import-schemas";
import type { Person } from "@/lib/db/schema";
import type { PersonPatchData } from "@/lib/schemas";
import { fromIsoDay } from "./dates";

/** A real calendar date (YYYY-MM-DD) or null: "2023-05" or "spring 2023" must not reach a date column. */
export function isoDate(s: string | null | undefined): string | null {
  return fromIsoDay(s) ? s! : null;
}

export type MergeTarget = Pick<Person, "headline" | "company" | "homeLocationId" | "metContext" | "metAt" | "circle" | "hobbies" | "howICanHelp" | "whatICanAsk"> & { categories: { categoryId: string }[] };
export type MergeCandidate = Pick<Candidate, "role" | "company" | "metContext" | "metDate" | "circle" | "hobbies" | "howICanHelp" | "whatICanAsk">;

/**
 * Only the fields that change, so an empty patch means "nothing to update" (an UPDATE with no values
 * throws). `metDate` is validated here. Legacy hobbies are sent only when the candidate adds one,
 * since updatePerson maps them onto the person's activities.
 */
export function mergePatch(existing: MergeTarget, c: MergeCandidate, home: PersonPatchData["homeLocation"] | null, categoryIds: string[]): PersonPatchData {
  const patch: PersonPatchData = {};
  const metAt = isoDate(c.metDate);
  if (!existing.headline && c.role) patch.headline = c.role;
  if (!existing.company && c.company) patch.company = c.company;
  if (!existing.homeLocationId && home) patch.homeLocation = home;
  if (!existing.metContext && c.metContext) patch.metContext = c.metContext;
  if (!existing.metAt && metAt) patch.metAt = metAt;
  if (!existing.circle && c.circle) patch.circle = c.circle;
  if (!existing.howICanHelp && c.howICanHelp) patch.howICanHelp = c.howICanHelp;
  if (!existing.whatICanAsk && c.whatICanAsk) patch.whatICanAsk = c.whatICanAsk;
  const hobbies = [...new Set([...existing.hobbies, ...c.hobbies])];
  if (hobbies.length > existing.hobbies.length) patch.hobbies = hobbies;
  const have = new Set(existing.categories.map((pc) => pc.categoryId));
  if (categoryIds.some((id) => !have.has(id))) patch.categoryIds = [...new Set([...have, ...categoryIds])];
  return patch;
}
