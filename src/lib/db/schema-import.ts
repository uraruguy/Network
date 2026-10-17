/**
 * Drizzle table objects for the import-resolution pipeline (migration 20261018000600).
 *
 * These are used with the query builder only (`db.select().from(importPeople)`), so they do not
 * need to be registered in the relational schema of `@/lib/db`. drizzle-kit reads only
 * `schema.ts`; at merge the new import_items / reminders columns should be mirrored there and the
 * duplicate table objects below (`importItemsX`, `remindersX`) replaced by the canonical ones.
 */
import { sql } from "drizzle-orm";
import { bigint, boolean, doublePrecision, index, integer, jsonb, pgEnum, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { importJobs, importStatusEnum, notes, people, recurrenceEnum, reminderStatusEnum } from "./schema";

const ownerId = () =>
  uuid("owner_id")
    .notNull()
    .default(sql`auth.uid()`);
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const IMPORT_PERSON_STATUS = ["proposed", "approved", "rejected", "merged", "committed"] as const;
export type ImportPersonStatus = (typeof IMPORT_PERSON_STATUS)[number];
export const importPersonStatusEnum = pgEnum("import_person_status", IMPORT_PERSON_STATUS);

/** import_items with the resolution columns (mirror of schema.importItems + 20261018000600). */
export const importItemsX = pgTable(
  "import_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: ownerId(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => importJobs.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    externalUuid: text("external_uuid"),
    title: text("title"),
    html: text("html"),
    text: text("text").notNull().default(""),
    folder: text("folder"),
    externalCreatedAt: timestamp("external_created_at", { withTimezone: true }),
    externalModifiedAt: timestamp("external_modified_at", { withTimezone: true }),
    contentHash: text("content_hash"),
    classification: text("classification"),
    classificationConfidence: doublePrecision("classification_confidence"),
    candidates: jsonb("candidates"),
    decision: jsonb("decision"),
    status: importStatusEnum("status").notNull().default("pending"),
    error: text("error"),
    source: text("source").notNull().default("apple-notes"),
    folders: text("folders").array().notNull().default(sql`'{}'::text[]`),
    screenedWith: text("screened_with"),
    extractionVersion: integer("extraction_version"),
    goneAt: timestamp("gone_at", { withTimezone: true }),
    noteId: uuid("note_id").references(() => notes.id, { onDelete: "set null" }),
    dismissedReason: text("dismissed_reason"),
    ...timestamps,
  },
  (t) => [index("import_items_owner_source_status_idx").on(t.ownerId, t.source, t.status), uniqueIndex("import_items_owner_external_uidx").on(t.ownerId, t.externalId)],
);

export const importPeople = pgTable(
  "import_people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: ownerId(),
    source: text("source").notNull().default("apple-notes"),
    key: text("key").notNull(),
    displayName: text("display_name").notNull(),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    disposition: text("disposition").$type<"person" | "passerby" | "not_person" | "self">().notNull().default("person"),
    profile: jsonb("profile").notNull().default({}),
    confidence: real("confidence"),
    reasons: text("reasons"),
    reviewFlags: text("review_flags").array().notNull().default(sql`'{}'::text[]`),
    needsReview: boolean("needs_review").notNull().default(true),
    status: importPersonStatusEnum("status").notNull().default("proposed"),
    decidedBy: text("decided_by").$type<"auto" | "user">(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    matchPersonId: uuid("match_person_id").references(() => people.id, { onDelete: "set null" }),
    mergedIntoId: uuid("merged_into_id").references((): AnyPgColumn => importPeople.id, { onDelete: "set null" }),
    committedPersonId: uuid("committed_person_id").references(() => people.id, { onDelete: "set null" }),
    createReminder: boolean("create_reminder").notNull().default(true),
    engine: text("engine"),
    proposalFile: text("proposal_file"),
    history: jsonb("history").notNull().default([]),
    ...timestamps,
  },
  (t) => [uniqueIndex("import_people_owner_source_key_uidx").on(t.ownerId, t.source, t.key), index("import_people_review_idx").on(t.ownerId, t.source, t.status, t.needsReview)],
);

export const MENTION_ROLES = ["primary", "mention", "listed", "excerpt"] as const;
export type MentionRole = (typeof MENTION_ROLES)[number];

export const importMentions = pgTable(
  "import_mentions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: ownerId(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => importItemsX.id, { onDelete: "cascade" }),
    candidateIndex: integer("candidate_index"),
    surface: text("surface").notNull(),
    importPersonId: uuid("import_person_id").references(() => importPeople.id, { onDelete: "set null" }),
    originalImportPersonId: uuid("original_import_person_id").references(() => importPeople.id, { onDelete: "set null" }),
    role: text("role").$type<MentionRole>().notNull().default("mention"),
    confidence: real("confidence"),
    reason: text("reason"),
    evidence: text("evidence"),
    excerpt: text("excerpt"),
    ...timestamps,
  },
  (t) => [index("import_mentions_person_idx").on(t.importPersonId)],
);

export const importCommitLog = pgTable("import_commit_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  ownerId: ownerId(),
  commitId: uuid("commit_id").notNull(),
  source: text("source").notNull().default("apple-notes"),
  importPersonId: uuid("import_person_id"),
  itemId: uuid("item_id"),
  tableName: text("table_name").notNull(),
  rowKey: jsonb("row_key").$type<Record<string, string>>().notNull(),
  op: text("op").$type<"insert" | "update">().notNull(),
  before: jsonb("before").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** reminders with provenance columns (mirror of schema.reminders + 20261018000600). */
export const remindersX = pgTable("reminders", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: ownerId(),
  personId: uuid("person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  message: text("message"),
  recurrence: recurrenceEnum("recurrence").notNull().default("none"),
  recurrenceDays: integer("recurrence_days"),
  status: reminderStatusEnum("status").notNull().default("pending"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  doneAt: timestamp("done_at", { withTimezone: true }),
  sourceKind: text("source_kind"),
  sourceRef: text("source_ref"),
  ...timestamps,
});

/* Defined by migration 20261018000100; schema.ts mirror lands at merge. */
export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: ownerId(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
});

/* Defined by migration 20261018000100; schema.ts mirror lands at merge. */
export const personActivities = pgTable(
  "person_activities",
  {
    personId: uuid("person_id").notNull(),
    activityId: uuid("activity_id").notNull(),
    ownerId: ownerId(),
  },
  (t) => [primaryKey({ columns: [t.personId, t.activityId] })],
);

export type ImportPerson = typeof importPeople.$inferSelect;
export type ImportMention = typeof importMentions.$inferSelect;
export type ImportItemX = typeof importItemsX.$inferSelect;
export type CommitLogRow = typeof importCommitLog.$inferSelect;
