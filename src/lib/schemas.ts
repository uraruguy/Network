import { z } from "zod";
import { CIRCLES, HOBBIES, NOTE_KINDS, RECURRENCE, WARMTH } from "@/lib/db/schema";

const optStr = z.string().trim().max(2000).nullish().transform((v) => (v ? v : null));
const optDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullish()
  .transform((v) => (v ? v : null));

export const locationInput = z.object({
  cityId: z.number().int().nullish(),
  name: z.string().trim().min(1),
  admin: optStr,
  country: z.string().trim().min(1),
  countryCode: optStr,
  lat: z.number(),
  lng: z.number(),
  timezone: optStr,
});
export type LocationInput = z.input<typeof locationInput>;
export type LocationData = z.output<typeof locationInput>;

export const personInput = z.object({
  displayName: z.string().trim().min(1).max(200),
  firstName: optStr,
  lastName: optStr,
  headline: optStr,
  company: optStr,
  homeLocation: locationInput.nullish(),
  metContext: optStr,
  metAt: optDate,
  metLocation: locationInput.nullish(),
  introducedById: z.string().uuid().nullish(),
  warmth: z.enum(WARMTH).default("active"),
  circle: z.enum(CIRCLES).nullish(),
  hobbies: z.array(z.enum(HOBBIES)).default([]),
  hobbiesOther: optStr,
  categoryIds: z.array(z.string().uuid()).default([]),
  email: optStr,
  phone: optStr,
  linkedin: optStr,
  xHandle: optStr,
  instagram: optStr,
  website: optStr,
  birthday: optDate,
  languages: z.array(z.string().trim().min(1)).default([]),
  interests: z.array(z.string().trim().min(1)).default([]),
  howICanHelp: optStr,
  whatICanAsk: optStr,
  followupCadenceDays: z.number().int().positive().nullish(),
  nextFollowupAt: z.string().datetime({ offset: true }).nullish(),
});
export type PersonInput = z.input<typeof personInput>;
export type PersonData = z.output<typeof personInput>;
export const personPatch = personInput.partial();
export type PersonPatch = z.input<typeof personPatch>;
export type PersonPatchData = z.output<typeof personPatch>;

export const noteInput = z.object({
  personId: z.string().uuid(),
  title: optStr,
  contentJson: z.unknown().nullish(),
  contentMd: z.string().default(""),
  contentText: z.string().default(""),
  kind: z.enum(NOTE_KINDS).default("note"),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  pinned: z.boolean().default(false),
  mentionIds: z.array(z.string().uuid()).default([]),
});
export type NoteInput = z.input<typeof noteInput>;
export type NoteData = z.output<typeof noteInput>;
export const notePatch = noteInput.omit({ personId: true }).partial();
export type NotePatch = z.input<typeof notePatch>;
export type NotePatchData = z.output<typeof notePatch>;

export const reminderInput = z.object({
  personId: z.string().uuid(),
  dueAt: z.string().datetime({ offset: true }),
  message: optStr,
  recurrence: z.enum(RECURRENCE).default("none"),
  recurrenceDays: z.number().int().positive().nullish(),
});
export type ReminderInput = z.input<typeof reminderInput>;
export type ReminderData = z.output<typeof reminderInput>;

export const categoryInput = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().trim().min(1).max(40),
  sort: z.number().int().default(0),
});
export type CategoryInput = z.input<typeof categoryInput>;
export type CategoryData = z.output<typeof categoryInput>;
