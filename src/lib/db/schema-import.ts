/**
 * Drizzle table objects for the import-resolution pipeline (migration 20261018000600).
 * Used with the query builder only (`db.select().from(importPeople)`), so they are not registered
 * in the relational schema of `@/lib/db`.
 */
import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { importItems, people } from "./schema";

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

/** Canonical tables, re-exported under the names the import pipeline was written against. */
export { importItems as importItemsX, reminders as remindersX, activities, personActivities } from "./schema";

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
      .references(() => importItems.id, { onDelete: "cascade" }),
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

export type ImportPerson = typeof importPeople.$inferSelect;
export type ImportMention = typeof importMentions.$inferSelect;
export type ImportItemX = typeof importItems.$inferSelect;
export type CommitLogRow = typeof importCommitLog.$inferSelect;
