import { z } from "zod";
import { CIRCLES, HOBBIES, WARMTH } from "@/lib/db/schema";

export const classificationSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().describe("The import item id, echoed back"),
      kind: z.enum(["person", "meeting", "list", "not_people"]).describe(
        "person: the note is about one specific person. meeting: notes from a meeting/call/event with one or more identifiable people. list: a list of several people (e.g. potential mentors). not_people: diary, ideas, tasks, business notes without identifiable people worth remembering.",
      ),
      confidence: z.number().min(0).max(1),
      peopleHint: z.array(z.string()).describe("Names of people the note is about (empty for not_people)"),
    }),
  ),
});
export type Classification = z.infer<typeof classificationSchema>["items"][number];

export const candidateSchema = z.object({
  name: z.string().describe("Full name as best as can be determined; keep original spelling/diacritics"),
  aliases: z.array(z.string()).default([]),
  role: z.string().nullable().describe("Job title / what they do"),
  company: z.string().nullable(),
  city: z.string().nullable().describe("City where they live, if mentioned or strongly implied"),
  country: z.string().nullable(),
  metContext: z.string().nullable().describe("Where/how/when Jakob met them, in Jakob's own words where possible (Slovenian is fine)"),
  metDate: z.string().nullable().describe("YYYY-MM-DD if known"),
  metCity: z.string().nullable(),
  categories: z.array(z.enum(["mentor", "friend", "partner", "investor", "client", "founder", "acquaint"])).default([]),
  warmth: z.enum(WARMTH).nullable(),
  circle: z.enum(CIRCLES).nullable(),
  hobbies: z.array(z.enum(HOBBIES)).default([]),
  introducedBy: z.string().nullable().describe("Name of the person who introduced them, if stated"),
  keyFacts: z.array(z.string()).default([]).describe("3-8 short facts worth remembering about this person"),
  howICanHelp: z.string().nullable(),
  whatICanAsk: z.string().nullable(),
  followUps: z.array(z.object({ what: z.string(), when: z.string().nullable().describe("YYYY-MM-DD or a relative phrase") })).default([]),
  links: z.array(z.string()).default([]).describe("URLs, handles (x.com/..., linkedin.com/in/...) found for this person"),
  confidence: z.number().min(0).max(1),
});
export type Candidate = z.infer<typeof candidateSchema>;

export const extractionSchema = z.object({
  noteSummary: z.string().describe("One or two sentences summarising the note (in the language it was written)"),
  suggestedTitle: z.string(),
  occurredAt: z.string().nullable().describe("YYYY-MM-DD the note's content refers to, if determinable"),
  candidates: z.array(candidateSchema),
});
export type Extraction = z.infer<typeof extractionSchema>;
