/**
 * Enum values shared by the database schema, API validation and the UI.
 * Lives outside `@/lib/db/schema` so client bundles never pull in drizzle table definitions.
 */
export const WARMTH = ["inner", "active", "dormant", "archive"] as const;
export const CIRCLES = ["nice_to_know", "hang_out_more", "potential_close"] as const;
export const NOTE_KINDS = ["note", "meeting", "call", "message"] as const;
export const RECURRENCE = ["none", "monthly", "quarterly", "semiannual", "yearly", "custom_days"] as const;
/** Legacy fixed hobby list; superseded by the user-editable `activities` table. */
export const HOBBIES = ["football", "skiing", "hiking", "running", "padel", "partying", "coffee", "lunch", "gym", "other"] as const;

export type Warmth = (typeof WARMTH)[number];
export type Circle = (typeof CIRCLES)[number];
export type NoteKind = (typeof NOTE_KINDS)[number];
export type Recurrence = (typeof RECURRENCE)[number];
export type Hobby = (typeof HOBBIES)[number];
