import { z } from "zod";
import { CIRCLES, NOTE_KINDS, RECURRENCE, WARMTH } from "@/lib/constants";
import { MAX_BASE_VERSIONS } from "@/lib/notes/version";

/*
 * Request validation shared by the API and the client.
 *
 * Patch schemas are built from field maps WITHOUT defaults: in Zod 4 `.partial()` still applies
 * `.default()` values to absent keys, which would silently reset fields (e.g. clear a note's body
 * when only `pinned` is sent). Defaults live only on the create schemas.
 */

const optStr = z.string().trim().max(2000).nullish().transform((v) => (v ? v : null));
const optDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullish()
  .transform((v) => (v ? v : null));
const uuid = z.string().uuid();
const isoDateTime = z.string().datetime({ offset: true });
const name60 = z.string().trim().min(1).max(60);

export const locationInput = z.object({
  cityId: z.number().int().nullish(),
  name: z.string().trim().min(1),
  admin: optStr,
  country: z.string().trim().min(1),
  countryCode: optStr,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  timezone: optStr,
});
export type LocationInput = z.input<typeof locationInput>;
export type LocationData = z.output<typeof locationInput>;

/* ------------------------------------------------------------------ */
/*  People                                                             */
/* ------------------------------------------------------------------ */

const personFields = {
  displayName: z.string().trim().min(1).max(200),
  firstName: optStr,
  lastName: optStr,
  headline: optStr,
  company: optStr,
  homeLocation: locationInput.nullish(),
  metContext: optStr,
  metAt: optDate,
  metLocation: locationInput.nullish(),
  introducedById: uuid.nullish(),
  warmth: z.enum(WARMTH),
  circle: z.enum(CIRCLES).nullish(),
  categoryIds: z.array(uuid).max(50),
  /** Replaces the person's activities. */
  activityIds: z.array(uuid).max(100),
  /** Replaces the person's tags; unknown names are created (case-insensitive match), so this works offline. */
  tagNames: z.array(name60).max(50),
  /** @deprecated v1 hobby slugs. Mapped onto activities (by slug) when `activityIds` is absent. */
  hobbies: z.array(name60).max(50),
  /** @deprecated v1 free-text hobbies ("Sailing, chess"). Mapped onto activities with `hobbies`. */
  hobbiesOther: optStr,
  email: optStr,
  phone: optStr,
  linkedin: optStr,
  xHandle: optStr,
  instagram: optStr,
  website: optStr,
  birthday: optDate,
  languages: z.array(z.string().trim().min(1)).max(30),
  interests: z.array(z.string().trim().min(1)).max(50),
  howICanHelp: optStr,
  whatICanAsk: optStr,
  followupCadenceDays: z.number().int().positive().max(3650).nullish(),
  nextFollowupAt: isoDateTime.nullish(),
};

export const personInput = z.object({
  ...personFields,
  /** Optional client-generated id (offline creation). Re-sending the same id is idempotent. */
  id: uuid.optional(),
  warmth: personFields.warmth.default("active"),
  categoryIds: personFields.categoryIds.default([]),
  activityIds: personFields.activityIds.optional(),
  tagNames: personFields.tagNames.optional(),
  hobbies: personFields.hobbies.optional(),
  languages: personFields.languages.default([]),
  interests: personFields.interests.default([]),
});
export type PersonInput = z.input<typeof personInput>;
export type PersonData = z.output<typeof personInput>;
export const personPatch = z.object(personFields).partial();
export type PersonPatch = z.input<typeof personPatch>;
export type PersonPatchData = z.output<typeof personPatch>;

/* ------------------------------------------------------------------ */
/*  Notes                                                              */
/* ------------------------------------------------------------------ */

const noteFields = {
  personId: uuid,
  title: optStr,
  contentJson: z.unknown().nullish(),
  contentMd: z.string().max(500_000),
  contentText: z.string().max(500_000),
  kind: z.enum(NOTE_KINDS),
  occurredAt: isoDateTime,
  pinned: z.boolean(),
  mentionIds: z.array(uuid).max(100),
};

export const noteInput = z.object({
  ...noteFields,
  contentMd: noteFields.contentMd.default(""),
  contentText: noteFields.contentText.default(""),
  kind: noteFields.kind.default("note"),
  occurredAt: noteFields.occurredAt.optional(),
  pinned: noteFields.pinned.default(false),
  mentionIds: noteFields.mentionIds.default([]),
});
export type NoteInput = z.input<typeof noteInput>;
export type NoteData = z.output<typeof noteInput>;

/** Partial update. `personId` moves the note to another person. */
export const notePatch = z.object(noteFields).partial();
export type NotePatch = z.input<typeof notePatch>;
export type NotePatchData = z.output<typeof notePatch>;

/**
 * Body of `PUT /api/notes/[id]` (idempotent create-or-update with a client-generated id).
 * `personId` is required when the note doesn't exist yet. `restore` revives a soft-deleted note.
 * `baseVersions` (content versions, see lib/notes/version) makes a content save conditional: it
 * is refused with 409 + the current note when the stored content changed underneath it.
 */
export const noteUpsert = notePatch.extend({
  restore: z.boolean().optional(),
  baseVersions: z.array(z.string().min(1).max(40)).max(MAX_BASE_VERSIONS).optional(),
});
export type NoteUpsert = z.input<typeof noteUpsert>;
export type NoteUpsertData = z.output<typeof noteUpsert>;

/* ------------------------------------------------------------------ */
/*  Reminders                                                          */
/* ------------------------------------------------------------------ */

export const reminderInput = z.object({
  /** Optional client-generated id (offline creation, undo of a delete). Re-sending the same id is idempotent. */
  id: uuid.optional(),
  personId: uuid,
  /** The note this follow-up came from. */
  noteId: uuid.nullish(),
  dueAt: isoDateTime,
  message: optStr,
  recurrence: z.enum(RECURRENCE).default("none"),
  recurrenceDays: z.number().int().positive().max(3650).nullish(),
});
export type ReminderInput = z.input<typeof reminderInput>;
export type ReminderData = z.output<typeof reminderInput>;

export const reminderAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("done") }),
  z.object({ action: z.literal("snooze"), days: z.number().int().min(1).max(365) }),
  z.object({ action: z.literal("reschedule"), dueAt: isoDateTime }),
  /** Edit a follow-up in place. A new `dueAt` re-opens it (like reschedule). */
  z.object({
    action: z.literal("update"),
    dueAt: isoDateTime.optional(),
    message: z
      .string()
      .trim()
      .max(2000)
      .nullish()
      .transform((v) => (v === undefined ? undefined : v ? v : null)),
    recurrence: z.enum(RECURRENCE).optional(),
    recurrenceDays: z.number().int().positive().max(3650).nullish(),
  }),
]);
export type ReminderAction = z.input<typeof reminderAction>;

/* ------------------------------------------------------------------ */
/*  Taxonomy                                                           */
/* ------------------------------------------------------------------ */

const categoryFields = {
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().trim().min(1).max(40),
  sort: z.number().int(),
};
export const categoryInput = z.object({ ...categoryFields, sort: categoryFields.sort.default(0) });
export const categoryPatch = z.object(categoryFields).partial();
export type CategoryInput = z.input<typeof categoryInput>;
export type CategoryData = z.output<typeof categoryInput>;

const emoji = z.string().trim().max(16).nullish().transform((v) => (v ? v : null));
export const activityInput = z.object({
  /** Optional client-generated id (offline creation). */
  id: uuid.optional(),
  name: name60,
  emoji,
  sort: z.number().int().optional(),
});
export const activityPatch = z.object({ name: name60, emoji, sort: z.number().int() }).partial();
export type ActivityInput = z.input<typeof activityInput>;
export type ActivityPatch = z.input<typeof activityPatch>;

export const reorderInput = z.object({ ids: z.array(uuid).min(1).max(500) });

const tagColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish();
export const tagPatch = z.object({ name: name60, color: tagColor }).partial();
export type TagPatch = z.input<typeof tagPatch>;
export const tagMerge = z.object({ intoId: uuid });
