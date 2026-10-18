/**
 * Request contracts for the quick import ("paste a note"): extract, then save.
 * Pure (zod only) so the sheet, the route handlers and the tests share one definition.
 */
import { z } from "zod";
import { CATEGORY_SLUGS, ExtractionV2 } from "@/lib/import/contracts";

export const QUICK_SOURCE = "paste";
export const QUICK_MAX_CHARS = 40_000;
/** Notes shorter than this are extracted with the fast model. */
export const QUICK_FAST_CHARS = 2_000;

const text = z
  .string()
  .transform((s) => s.replace(/\r\n?/g, "\n").trim())
  .pipe(z.string().min(3, "Paste a note first").max(QUICK_MAX_CHARS, `Notes are limited to ${QUICK_MAX_CHARS.toLocaleString("en")} characters`));

export const quickExtractInput = z.object({
  text,
  /** The person the note is about (the sheet was opened from their page). */
  personId: z.string().uuid().optional(),
});
export type QuickExtractInput = z.infer<typeof quickExtractInput>;

export const QUICK_ACTIONS = ["create", "merge", "skip"] as const;
export type QuickAction = (typeof QUICK_ACTIONS)[number];

export const quickPersonDecision = z
  .object({
    /** Candidate index in `extraction.candidates`. */
    index: z.number().int().min(0),
    action: z.enum(QUICK_ACTIONS),
    /** Existing person to merge into (required for `merge`). */
    matchPersonId: z.string().uuid().nullable().optional(),
    displayName: z.string().trim().min(1).max(200),
    categories: z.array(z.enum(CATEGORY_SLUGS)).max(7).optional(),
    createReminder: z.boolean().default(true),
  })
  .refine((d) => d.action !== "merge" || !!d.matchPersonId, { message: "Choose who to merge into", path: ["matchPersonId"] });
export type QuickPersonDecision = z.infer<typeof quickPersonDecision>;

export const quickSaveInput = z
  .object({
    text,
    title: z.string().trim().max(300).nullish(),
    personId: z.string().uuid().optional(),
    extraction: ExtractionV2,
    people: z.array(quickPersonDecision).max(60),
    /** Candidate the note is filed under when no `personId` is given. */
    primaryIndex: z.number().int().min(0).nullish(),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<number>();
    for (const [i, p] of v.people.entries()) {
      if (p.index >= v.extraction.candidates.length) ctx.addIssue({ code: "custom", message: "Unknown person", path: ["people", i, "index"] });
      if (seen.has(p.index)) ctx.addIssue({ code: "custom", message: "Duplicate person", path: ["people", i, "index"] });
      seen.add(p.index);
    }
    const kept = v.people.filter((p) => p.action !== "skip");
    if (!v.personId && !kept.length) ctx.addIssue({ code: "custom", message: "Keep at least one person to file the note under", path: ["people"] });
    if (!v.personId && v.primaryIndex != null && !kept.some((p) => p.index === v.primaryIndex)) {
      ctx.addIssue({ code: "custom", message: "The note must be filed under someone you keep", path: ["primaryIndex"] });
    }
  });
export type QuickSaveInput = z.infer<typeof quickSaveInput>;

/** Default decision for a candidate given its best match suggestion. */
export function defaultQuickAction(candidate: { confidence: number }, best: { exact: boolean } | null | undefined): QuickAction {
  if (best?.exact) return "merge";
  if (candidate.confidence < 0.45) return "skip";
  return "create";
}

/** The candidate a note is filed under by default: the most salient one that is kept. */
export function defaultPrimaryIndex(candidates: { salience: number }[], kept: number[]): number | null {
  let best: number | null = null;
  for (const i of kept) if (best === null || (candidates[i]?.salience ?? 0) > (candidates[best]?.salience ?? 0)) best = i;
  return best;
}
