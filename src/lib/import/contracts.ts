/**
 * Contracts for every file a stage of the import pipeline reads or writes.
 * Stage files are produced by scripts and by Claude subagents; everything is validated here.
 */
import { z } from "zod";
import { CIRCLES, WARMTH } from "@/lib/constants";
import { KEY_RE } from "./names";

export const SCHEMA_VERSION = 1 as const;
export const EXTRACTION_VERSION = 2 as const;

export const CATEGORY_SLUGS = ["mentor", "friend", "partner", "investor", "client", "founder", "acquaint"] as const;
export const SCREEN_KINDS = ["person", "meeting", "list", "journal", "not_people"] as const;
export const DISPOSITIONS = ["person", "passerby", "not_person", "self"] as const;
export const REVIEW_FLAGS = [
  "first_name_only",
  "ambiguous_first_name",
  "possible_duplicate",
  "existing_match_uncertain",
  "gender_conflict",
  "conflicting_facts",
  "low_evidence",
  "stale",
  "split_candidate",
  "self_uncertain",
  "user_attention",
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const partialDate = z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, "YYYY, YYYY-MM or YYYY-MM-DD");
const nstr = (max = 500) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const strArr = (maxItem = 200) => z.array(z.string().trim().min(1).max(maxItem)).default([]);
const key = z.string().regex(KEY_RE, "lowercase slug (a-z, 0-9, dashes)").max(80);
const confidence = z.number().min(0).max(1);

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export const ScreenItem = z.object({
  id: z.string().describe("The note id, echoed back exactly"),
  kind: z.enum(SCREEN_KINDS).describe(
    "person: about one specific person · meeting: a meeting/call/event with identifiable people · list: a list of several people · journal: diary/day log that mentions people in passing · not_people: no identifiable people worth remembering",
  ),
  confidence,
  peopleHint: z.array(z.string()).describe("Names of people the note is about (empty for not_people)"),
  reason: z.string().max(200).nullish().describe("Few words why"),
});
export const ScreenResult = z.object({ items: z.array(ScreenItem) });
export type ScreenItem = z.infer<typeof ScreenItem>;
export type ScreenResult = z.infer<typeof ScreenResult>;

/* ------------------------------------------------------------------ */
/*  Extraction v2                                                      */
/* ------------------------------------------------------------------ */

export const FollowUpV2 = z.object({
  what: z.string().describe("The concrete next step, in the note's language"),
  when: z.string().nullable().describe("As written (\"čez 2 tedna\", \"next week\", \"1.12.\") or null"),
  explicitDate: isoDate.nullable().describe("YYYY-MM-DD only when the note states a calendar date"),
});
export type FollowUpV2 = z.infer<typeof FollowUpV2>;

export const CandidateV2 = z.object({
  name: z.string().describe("Fullest name as written in the note, nominative case, original diacritics"),
  aliases: z.array(z.string()).default([]).describe("Other names/nicknames used for this person in the note"),
  surfaces: z.array(z.string()).default([]).describe("Every verbatim form the name takes in the text, incl. declined forms (Blažem, Kajo)"),
  gender: z.enum(["m", "f"]).nullable().describe("From grammar (rekel/rekla) or context; null if unclear"),
  salience: confidence.describe("How central this person is to the note: 1 = the note is about them, 0.2 = passing mention"),
  role: z.string().nullable(),
  company: z.string().nullable(),
  city: z.string().nullable().describe("Where they live, if stated or strongly implied"),
  country: z.string().nullable(),
  metContext: z.string().nullable().describe("How/where/when Jakob met them, in Jakob's words where possible"),
  metDate: z.string().nullable().describe("YYYY-MM-DD, YYYY-MM or YYYY if known"),
  metCity: z.string().nullable(),
  categories: z.array(z.enum(CATEGORY_SLUGS)).default([]),
  warmth: z.enum(WARMTH).nullable(),
  circle: z.enum(CIRCLES).nullable(),
  activities: z.array(z.string()).default([]).describe("Things they do / Jakob does with them, lowercase English: hiking, padel, cross-country skiing, hanging out"),
  introducedBy: z.string().nullable(),
  keyFacts: z.array(z.string()).default([]).describe("Up to 8 short factual statements worth remembering"),
  howICanHelp: z.string().nullable(),
  whatICanAsk: z.string().nullable(),
  followUps: z.array(FollowUpV2).default([]),
  links: z.array(z.string()).default([]),
  excerpt: z.string().nullable().describe("The most relevant passage about this person, copied VERBATIM from the note (≤600 chars)"),
  confidence: confidence.describe("That this is a real, identifiable person worth a contact card"),
});
export type CandidateV2 = z.infer<typeof CandidateV2>;

export const ExtractionV2 = z.object({
  version: z.literal(EXTRACTION_VERSION).default(EXTRACTION_VERSION),
  noteSummary: z.string(),
  suggestedTitle: z.string(),
  occurredAt: z.string().nullable().describe("YYYY-MM-DD the note's content refers to, if determinable"),
  candidates: z.array(CandidateV2),
  chunks: z.number().int().positive().optional(),
  mode: z.enum(["full", "journal"]).optional(),
});
export type ExtractionV2 = z.infer<typeof ExtractionV2>;

/** Shape the model is asked to produce (version/chunks are added by code). */
export const ExtractionV2Model = ExtractionV2.omit({ version: true, chunks: true, mode: true });

/** v1 extraction as stored by the first import run (import_items.candidates, extraction_version 1/null). */
export const CandidateV1 = z
  .object({
    name: z.string(),
    aliases: z.array(z.string()).default([]),
    role: z.string().nullish(),
    company: z.string().nullish(),
    city: z.string().nullish(),
    country: z.string().nullish(),
    metCity: z.string().nullish(),
    metDate: z.string().nullish(),
    metContext: z.string().nullish(),
    links: z.array(z.string()).default([]),
    circle: z.string().nullish(),
    warmth: z.string().nullish(),
    categories: z.array(z.string()).default([]),
    hobbies: z.array(z.string()).default([]),
    keyFacts: z.array(z.string()).default([]),
    followUps: z.array(z.object({ what: z.string(), when: z.string().nullish() })).default([]),
    howICanHelp: z.string().nullish(),
    whatICanAsk: z.string().nullish(),
    introducedBy: z.string().nullish(),
    confidence: z.number().default(0.5),
    matchName: z.string().nullish(),
    matchPersonId: z.string().nullish(),
  })
  .passthrough();
export const ExtractionV1 = z
  .object({
    candidates: z.array(CandidateV1).default([]),
    occurredAt: z.string().nullish(),
    peopleHint: z.array(z.string()).nullish(),
    noteSummary: z.string().nullish(),
    suggestedTitle: z.string().nullish(),
  })
  .passthrough();
export type CandidateV1 = z.infer<typeof CandidateV1>;
export type ExtractionV1 = z.infer<typeof ExtractionV1>;

/* ------------------------------------------------------------------ */
/*  Profile proposal (one per resolved person)                         */
/* ------------------------------------------------------------------ */

export const ProfileProposal = z.object({
  role: nstr(200),
  company: nstr(200),
  city: nstr(120),
  country: nstr(120),
  metContext: nstr(600),
  metDate: partialDate.nullish().transform((v) => v ?? null),
  metCity: nstr(120),
  warmth: z.enum(WARMTH).nullish().transform((v) => v ?? null),
  circle: z.enum(CIRCLES).nullish().transform((v) => v ?? null),
  categories: z.array(z.enum(CATEGORY_SLUGS)).default([]),
  activities: strArr(60),
  tags: strArr(60),
  keyFacts: z.array(z.string().trim().min(1).max(400)).max(8).default([]),
  howICanHelp: nstr(600),
  whatICanAsk: nstr(600),
  links: strArr(400),
  introducedByKey: key.nullish().transform((v) => v ?? null),
  followUps: z
    .array(z.object({ what: z.string().trim().min(1).max(400), when: nstr(120), sourceItemId: z.string().nullish().transform((v) => v ?? null) }))
    .default([]),
  firstSeen: isoDate.nullish().transform((v) => v ?? null),
  lastSeen: isoDate.nullish().transform((v) => v ?? null),
});
export type ProfileProposal = z.infer<typeof ProfileProposal>;
export const emptyProfile = (): ProfileProposal => ProfileProposal.parse({});

/* ------------------------------------------------------------------ */
/*  Resolution (subagent output, one file per packet)                  */
/* ------------------------------------------------------------------ */

export const ResolvedPerson = z.object({
  key,
  displayName: z.string().trim().min(1).max(200),
  firstName: nstr(100),
  lastName: nstr(100),
  aliases: strArr(120),
  disposition: z.enum(DISPOSITIONS),
  existingPersonId: z.string().uuid().nullish().transform((v) => v ?? null),
  confidence,
  needsReview: z.boolean(),
  reviewFlags: z.array(z.enum(REVIEW_FLAGS)).default([]),
  possibleSameAs: z
    .union([z.string(), z.array(z.string())])
    .nullish()
    .transform((v) => (v == null ? [] : Array.isArray(v) ? v : [v])),
  reasons: z.string().trim().max(300),
  profile: ProfileProposal.default(emptyProfile()),
});
export type ResolvedPerson = z.infer<typeof ResolvedPerson>;

export const Assignment = z.object({
  mentionId: z.string().min(3),
  personKey: key.nullable(),
  confidence,
  reason: z.string().trim().max(300).nullish().transform((v) => v ?? null),
});
export type Assignment = z.infer<typeof Assignment>;

export const ResolutionFile = z.object({
  packetId: z.string().min(1),
  engine: z.string().min(1),
  model: z.string().optional(),
  schemaVersion: z.literal(SCHEMA_VERSION),
  people: z.array(ResolvedPerson),
  assignments: z.array(Assignment),
});
export type ResolutionFile = z.infer<typeof ResolutionFile>;

/* ------------------------------------------------------------------ */
/*  Filing (which person a note is filed under)                        */
/* ------------------------------------------------------------------ */

export const FILING_MODES = ["primary", "list", "journal", "dismiss"] as const;
export const Filing = z.object({
  itemId: z.string().uuid(),
  mode: z.enum(FILING_MODES),
  primaryPersonKey: key.nullish().transform((v) => v ?? null),
  excerpts: z.array(z.object({ personKey: key, excerpt: z.string().min(1).max(4000) })).default([]),
  dismissReason: nstr(200),
  reason: z.string().trim().max(300).default(""),
});
export type Filing = z.infer<typeof Filing>;

export const FilingFile = z.object({
  packetId: z.string().min(1),
  engine: z.string().min(1),
  model: z.string().optional(),
  schemaVersion: z.literal(SCHEMA_VERSION),
  filings: z.array(Filing),
});
export type FilingFile = z.infer<typeof FilingFile>;

/* ------------------------------------------------------------------ */
/*  Packets (written by prepare.ts, read by subagents + validate.ts)   */
/* ------------------------------------------------------------------ */

export const MentionRecord = z.object({
  mentionId: z.string(),
  itemId: z.string(),
  index: z.number().int(),
  surface: z.string(),
  aliases: z.array(z.string()),
  lemmas: z.array(z.string()),
  folders: z.array(z.string()),
  title: z.string().nullable(),
  date: isoDate.nullable(),
  classification: z.string().nullable(),
  extractionVersion: z.number().int(),
  role: z.string().nullable(),
  company: z.string().nullable(),
  city: z.string().nullable(),
  categories: z.array(z.string()),
  keyFacts: z.array(z.string()),
  salience: z.number().nullable(),
  gender: z.enum(["m", "f"]).nullable(),
  genderHint: z.enum(["m", "f"]).nullable(),
  coMentions: z.array(z.string()),
  snippets: z.array(z.string()),
  excerpt: z.string().nullable(),
  confidence: z.number(),
  noteFile: z.string(),
});
export type MentionRecord = z.infer<typeof MentionRecord>;

export const Anchor = z.object({
  kind: z.enum(["person", "proposal"]),
  id: z.string(),
  key: z.string().nullable(),
  displayName: z.string(),
  aliases: z.array(z.string()),
  summary: z.string(),
  status: z.string().nullable(),
});
export type Anchor = z.infer<typeof Anchor>;

export const ResolvePacket = z.object({
  packetId: z.string(),
  schemaVersion: z.literal(SCHEMA_VERSION),
  runId: z.string(),
  kind: z.enum(["ambiguous", "unique"]),
  clusters: z.array(
    z.object({
      clusterId: z.string(),
      label: z.string(),
      mentionIds: z.array(z.string()),
      part: z.string().nullable(),
      siblings: z.array(z.string()),
    }),
  ),
  mentions: z.array(MentionRecord),
  anchors: z.array(Anchor),
});
export type ResolvePacket = z.infer<typeof ResolvePacket>;

export const FilingPacket = z.object({
  packetId: z.string(),
  schemaVersion: z.literal(SCHEMA_VERSION),
  runId: z.string(),
  items: z.array(
    z.object({
      itemId: z.string(),
      title: z.string().nullable(),
      folders: z.array(z.string()),
      classification: z.string().nullable(),
      noteFile: z.string(),
      why: z.string(),
      people: z.array(z.object({ personKey: z.string(), displayName: z.string(), surfaces: z.array(z.string()), salience: z.number().nullable(), status: z.string() })),
    }),
  ),
});
export type FilingPacket = z.infer<typeof FilingPacket>;

/** Formats zod issues as "path: message" lines. */
export function formatIssues(err: z.ZodError, limit = 30): string[] {
  return err.issues.slice(0, limit).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}
