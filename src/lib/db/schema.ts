import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/*  Enums                                                              */
/* ------------------------------------------------------------------ */

export const warmthEnum = pgEnum("warmth", ["inner", "active", "dormant", "archive"]);
export const noteKindEnum = pgEnum("note_kind", ["note", "meeting", "call", "message"]);
export const reminderStatusEnum = pgEnum("reminder_status", ["pending", "sent", "done", "snoozed"]);
export const recurrenceEnum = pgEnum("recurrence", ["none", "monthly", "quarterly", "semiannual", "yearly", "custom_days"]);
export const importStatusEnum = pgEnum("import_status", ["pending", "classified", "extracted", "approved", "skipped", "committed", "failed"]);
export const inboxStatusEnum = pgEnum("inbox_status", ["new", "proposed", "applied", "dismissed"]);
export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant", "system", "tool"]);

export const WARMTH = warmthEnum.enumValues;
export const NOTE_KINDS = noteKindEnum.enumValues;
export const RECURRENCE = recurrenceEnum.enumValues;

/* ------------------------------------------------------------------ */
/*  Shared column helpers                                              */
/* ------------------------------------------------------------------ */

const ownerId = () =>
  uuid("owner_id")
    .notNull()
    .default(sql`auth.uid()`);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/* ------------------------------------------------------------------ */
/*  Reference data                                                     */
/* ------------------------------------------------------------------ */

/** World cities dataset (simplemaps basic). Read-only reference, shared. */
export const cities = pgTable(
  "cities",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    asciiName: text("ascii_name").notNull(),
    admin: text("admin"),
    country: text("country").notNull(),
    countryCode: text("country_code").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    population: integer("population"),
    timezone: text("timezone"),
  },
  (t) => [index("cities_ascii_name_idx").on(t.asciiName), index("cities_population_idx").on(t.population)],
);

/* ------------------------------------------------------------------ */
/*  Owner-scoped tables                                                */
/* ------------------------------------------------------------------ */

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // = auth.users.id
  email: text("email").notNull(),
  displayName: text("display_name"),
  timezone: text("timezone").notNull().default("Europe/Ljubljana"),
  homeLocationId: uuid("home_location_id"),
  digestHour: integer("digest_hour").notNull().default(7),
  digestEnabled: boolean("digest_enabled").notNull().default(true),
  inboxToken: text("inbox_token"),
  ...timestamps,
});

/** A resolved place a person is associated with. */
export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: ownerId(),
    name: text("name").notNull(),
    admin: text("admin"),
    country: text("country").notNull(),
    countryCode: text("country_code"),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    timezone: text("timezone"),
    cityId: integer("city_id").references(() => cities.id),
    source: text("source").notNull().default("cities"),
    ...timestamps,
  },
  (t) => [index("locations_owner_idx").on(t.ownerId), uniqueIndex("locations_owner_city_uidx").on(t.ownerId, t.cityId)],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: ownerId(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    color: text("color").notNull(),
    icon: text("icon").notNull(),
    sort: integer("sort").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("categories_owner_slug_uidx").on(t.ownerId, t.slug)],
);

export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: ownerId(),
    displayName: text("display_name").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    avatarUrl: text("avatar_url"),
    headline: text("headline"),
    company: text("company"),
    homeLocationId: uuid("home_location_id").references(() => locations.id, { onDelete: "set null" }),

    metContext: text("met_context"),
    metAt: date("met_at"),
    metLocationId: uuid("met_location_id").references(() => locations.id, { onDelete: "set null" }),
    introducedById: uuid("introduced_by_id"),

    warmth: warmthEnum("warmth").notNull().default("active"),

    email: text("email"),
    phone: text("phone"),
    linkedin: text("linkedin"),
    xHandle: text("x_handle"),
    instagram: text("instagram"),
    website: text("website"),
    birthday: date("birthday"),
    languages: text("languages").array().notNull().default(sql`'{}'::text[]`),
    interests: text("interests").array().notNull().default(sql`'{}'::text[]`),
    howICanHelp: text("how_i_can_help"),
    whatICanAsk: text("what_i_can_ask"),
    aiSummary: text("ai_summary"),
    aiSummaryAt: timestamp("ai_summary_at", { withTimezone: true }),

    lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),
    nextFollowupAt: timestamp("next_followup_at", { withTimezone: true }),
    followupCadenceDays: integer("followup_cadence_days"),

    sourceKind: text("source_kind"),
    sourceRef: text("source_ref"),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("people_owner_idx").on(t.ownerId),
    index("people_owner_name_idx").on(t.ownerId, t.displayName),
    index("people_home_location_idx").on(t.homeLocationId),
    index("people_next_followup_idx").on(t.nextFollowupAt),
  ],
);

export const personCategories = pgTable(
  "person_categories",
  {
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    ownerId: ownerId(),
  },
  (t) => [primaryKey({ columns: [t.personId, t.categoryId] })],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: ownerId(),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("tags_owner_name_uidx").on(t.ownerId, t.name)],
);

export const personTags = pgTable(
  "person_tags",
  {
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    ownerId: ownerId(),
  },
  (t) => [primaryKey({ columns: [t.personId, t.tagId] })],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: ownerId(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    title: text("title"),
    contentJson: jsonb("content_json"),
    contentMd: text("content_md").notNull().default(""),
    contentText: text("content_text").notNull().default(""),
    kind: noteKindEnum("kind").notNull().default("note"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    pinned: boolean("pinned").notNull().default(false),
    sourceKind: text("source_kind"),
    sourceRef: text("source_ref"),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("notes_owner_idx").on(t.ownerId), index("notes_person_idx").on(t.personId, t.occurredAt)],
);

export const noteMentions = pgTable(
  "note_mentions",
  {
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    ownerId: ownerId(),
  },
  (t) => [primaryKey({ columns: [t.noteId, t.personId] })],
);

export const reminders = pgTable(
  "reminders",
  {
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
    ...timestamps,
  },
  (t) => [index("reminders_owner_due_idx").on(t.ownerId, t.status, t.dueAt), index("reminders_person_idx").on(t.personId)],
);

export const inboxItems = pgTable(
  "inbox_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: ownerId(),
    text: text("text").notNull(),
    source: text("source").notNull().default("shortcut"),
    status: inboxStatusEnum("status").notNull().default("new"),
    proposal: jsonb("proposal"),
    appliedPersonId: uuid("applied_person_id"),
    ...timestamps,
  },
  (t) => [index("inbox_owner_status_idx").on(t.ownerId, t.status)],
);

export const importJobs = pgTable("import_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: ownerId(),
  source: text("source").notNull().default("apple-notes"),
  label: text("label"),
  totalItems: integer("total_items").notNull().default(0),
  ...timestamps,
});

export const importItems = pgTable(
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
    ...timestamps,
  },
  (t) => [
    index("import_items_job_idx").on(t.jobId, t.status),
    uniqueIndex("import_items_owner_external_uidx").on(t.ownerId, t.externalId),
  ],
);

export const chatThreads = pgTable("chat_threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: ownerId(),
  title: text("title"),
  personId: uuid("person_id").references(() => people.id, { onDelete: "set null" }),
  ...timestamps,
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: ownerId(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    role: chatRoleEnum("role").notNull(),
    parts: jsonb("parts").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_messages_thread_idx").on(t.threadId, t.createdAt)],
);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: ownerId(),
  endpoint: text("endpoint").notNull().unique(),
  keys: jsonb("keys").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/*  Relations                                                          */
/* ------------------------------------------------------------------ */

export const peopleRelations = relations(people, ({ one, many }) => ({
  homeLocation: one(locations, { fields: [people.homeLocationId], references: [locations.id], relationName: "home" }),
  metLocation: one(locations, { fields: [people.metLocationId], references: [locations.id], relationName: "met" }),
  introducedBy: one(people, { fields: [people.introducedById], references: [people.id], relationName: "introducer" }),
  categories: many(personCategories),
  tags: many(personTags),
  notes: many(notes),
  reminders: many(reminders),
  mentions: many(noteMentions),
}));

export const personCategoriesRelations = relations(personCategories, ({ one }) => ({
  person: one(people, { fields: [personCategories.personId], references: [people.id] }),
  category: one(categories, { fields: [personCategories.categoryId], references: [categories.id] }),
}));

export const personTagsRelations = relations(personTags, ({ one }) => ({
  person: one(people, { fields: [personTags.personId], references: [people.id] }),
  tag: one(tags, { fields: [personTags.tagId], references: [tags.id] }),
}));

export const notesRelations = relations(notes, ({ one, many }) => ({
  person: one(people, { fields: [notes.personId], references: [people.id] }),
  mentions: many(noteMentions),
}));

export const noteMentionsRelations = relations(noteMentions, ({ one }) => ({
  note: one(notes, { fields: [noteMentions.noteId], references: [notes.id] }),
  person: one(people, { fields: [noteMentions.personId], references: [people.id] }),
}));

export const remindersRelations = relations(reminders, ({ one }) => ({
  person: one(people, { fields: [reminders.personId], references: [people.id] }),
}));

export const locationsRelations = relations(locations, ({ many }) => ({
  residents: many(people, { relationName: "home" }),
}));

export const importItemsRelations = relations(importItems, ({ one }) => ({
  job: one(importJobs, { fields: [importItems.jobId], references: [importJobs.id] }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  thread: one(chatThreads, { fields: [chatMessages.threadId], references: [chatThreads.id] }),
}));

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type Person = typeof people.$inferSelect;
export type NewPerson = typeof people.$inferInsert;
export type Location = typeof locations.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type Reminder = typeof reminders.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type City = typeof cities.$inferSelect;
export type ImportItem = typeof importItems.$inferSelect;
export type InboxItem = typeof inboxItems.$inferSelect;
export type Warmth = (typeof WARMTH)[number];
export type NoteKind = (typeof NOTE_KINDS)[number];
