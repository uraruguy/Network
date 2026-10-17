import { CIRCLES, HOBBIES, NOTE_KINDS, RECURRENCE, WARMTH, type Circle, type Hobby, type NoteKind, type Warmth } from "@/lib/constants";
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/*
 * Mirrors the SQL migrations in supabase/migrations (the source of truth). Everything the
 * migrations add by hand — triggers, RLS, functions, the `network` text search config — lives
 * only in SQL.
 */

/* ------------------------------------------------------------------ */
/*  Enums                                                              */
/* ------------------------------------------------------------------ */

export const warmthEnum = pgEnum("warmth", WARMTH);
export const circleEnum = pgEnum("circle", CIRCLES);
export const noteKindEnum = pgEnum("note_kind", NOTE_KINDS);
export const reminderStatusEnum = pgEnum("reminder_status", ["pending", "sent", "done", "snoozed"]);
export const recurrenceEnum = pgEnum("recurrence", RECURRENCE);
export const importStatusEnum = pgEnum("import_status", ["pending", "classified", "extracted", "approved", "skipped", "committed", "failed"]);
export const inboxStatusEnum = pgEnum("inbox_status", ["new", "proposed", "applied", "dismissed"]);
export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant", "system", "tool"]);

export { WARMTH, CIRCLES, HOBBIES, NOTE_KINDS, RECURRENCE };

/* ------------------------------------------------------------------ */
/*  Shared column helpers                                              */
/* ------------------------------------------------------------------ */

/** Supabase's auth.users — only referenced by foreign keys, never queried or migrated by drizzle. */
const authUsers = pgSchema("auth").table("users", { id: uuid("id").primaryKey() });

const ownerId = () =>
  uuid("owner_id")
    .notNull()
    .default(sql`auth.uid()`);

/** Owner column with a foreign key to auth.users (used by tables added in v2). */
const ownerRef = () =>
  uuid("owner_id")
    .notNull()
    .default(sql`auth.uid()`)
    .references(() => authUsers.id, { onDelete: "cascade" });

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** Postgres full-text vector. Only used inside SQL; never select it into API responses. */
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

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
  /** Local date (profile timezone) the last digest e-mail went out. */
  lastDigestOn: date("last_digest_on"),
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
  (t) => [
    index("locations_owner_idx").on(t.ownerId),
    uniqueIndex("locations_owner_city_uidx").on(t.ownerId, t.cityId),
    index("locations_owner_country_idx").on(t.ownerId, t.countryCode),
  ],
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
    introducedById: uuid("introduced_by_id").references((): AnyPgColumn => people.id, { onDelete: "set null" }),

    warmth: warmthEnum("warmth").notNull().default("active"),
    circle: circleEnum("circle"),
    /** @deprecated v1 fixed hobby list, superseded by `person_activities`. Kept for the v1 app; v2 never writes it. */
    hobbies: text("hobbies").array().notNull().default(sql`'{}'::text[]`),
    /** @deprecated v1 free-text hobbies, superseded by `person_activities`. */
    hobbiesOther: text("hobbies_other"),

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
    /** Maintained by the `sync_next_followup` trigger on reminders (earliest open reminder). */
    nextFollowupAt: timestamp("next_followup_at", { withTimezone: true }),
    followupCadenceDays: integer("followup_cadence_days"),

    sourceKind: text("source_kind"),
    sourceRef: text("source_ref"),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    /** Generated: name (A), company + headline (B), context fields (C). */
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector('public.network', coalesce(display_name, '')), 'A') || setweight(to_tsvector('public.network', coalesce(company, '') || ' ' || coalesce(headline, '')), 'B') || setweight(to_tsvector('public.network', coalesce(met_context, '') || ' ' || coalesce(how_i_can_help, '') || ' ' || coalesce(what_i_can_ask, '') || ' ' || private.join_text(interests)), 'C')`,
    ),
  },
  (t) => [
    index("people_owner_idx").on(t.ownerId),
    index("people_owner_name_idx").on(t.ownerId, t.displayName),
    index("people_home_location_idx").on(t.homeLocationId),
    index("people_next_followup_idx").on(t.nextFollowupAt),
    index("people_owner_recent_idx")
      .on(t.ownerId, sql`(coalesce(${t.lastInteractionAt}, ${t.createdAt})) desc`, t.id)
      .where(sql`${t.deletedAt} is null`),
    index("people_owner_warmth_idx").on(t.ownerId, t.warmth).where(sql`${t.deletedAt} is null`),
    index("people_search_idx").using("gin", t.search),
    index("people_name_unaccent_trgm_idx").using("gin", sql`private.f_unaccent(lower(${t.displayName})) gin_trgm_ops`),
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
  (t) => [primaryKey({ columns: [t.personId, t.categoryId] }), index("person_categories_category_idx").on(t.categoryId)],
);

/** Free-form labels. Names are unique per owner, case-insensitively. */
export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: ownerId(),
    name: text("name").notNull(),
    color: text("color"),
    ...timestamps,
  },
  (t) => [uniqueIndex("tags_owner_lower_name_uidx").on(t.ownerId, sql`lower(${t.name})`)],
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
  (t) => [primaryKey({ columns: [t.personId, t.tagId] }), index("person_tags_tag_idx").on(t.tagId)],
);

/** Things you do together (football, dinners, hiking …). User-editable, seeded per owner. */
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: ownerRef(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    emoji: text("emoji"),
    sort: integer("sort").notNull().default(0),
    ...timestamps,
  },
  (t) => [unique("activities_owner_slug_key").on(t.ownerId, t.slug)],
);

export const personActivities = pgTable(
  "person_activities",
  {
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    ownerId: ownerId(),
  },
  (t) => [primaryKey({ name: "person_activities_pkey", columns: [t.personId, t.activityId] }), index("person_activities_activity_idx").on(t.activityId)],
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
    /** Generated: title (A) + body (B). */
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector('public.network', coalesce(title, '')), 'A') || setweight(to_tsvector('public.network', coalesce(content_text, '')), 'B')`,
    ),
  },
  (t) => [
    index("notes_owner_idx").on(t.ownerId),
    index("notes_person_idx").on(t.personId, t.occurredAt),
    index("notes_person_timeline_idx").on(t.personId, t.occurredAt.desc()).where(sql`${t.deletedAt} is null`),
    index("notes_owner_timeline_idx").on(t.ownerId, t.occurredAt.desc()).where(sql`${t.deletedAt} is null`),
    index("notes_owner_updated_idx").on(t.ownerId, t.updatedAt.desc()).where(sql`${t.deletedAt} is null`),
    index("notes_search_idx").using("gin", t.search),
  ],
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
    /** The note this follow-up came from, if any. */
    noteId: uuid("note_id").references(() => notes.id, { onDelete: "set null" }),
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
    /** Token usage reported by the model provider for this message. */
    usage: jsonb("usage"),
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
/*  API access, audit, passkeys, connections (v2)                      */
/* ------------------------------------------------------------------ */

/** Personal API tokens. Only a SHA-256 hash of the secret is stored. */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: ownerRef(),
    name: text("name").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    scopes: text("scopes").array().notNull().default(sql`'{network:read}'::text[]`),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("api_tokens_owner_idx").on(t.ownerId)],
);

/** OAuth clients (e.g. MCP connectors) the owner approved. */
export const oauthClientGrants = pgTable(
  "oauth_client_grants",
  {
    ownerId: ownerRef(),
    clientId: text("client_id").notNull(),
    clientName: text("client_name"),
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ name: "oauth_client_grants_pkey", columns: [t.ownerId, t.clientId] })],
);

/** Append-only record of sensitive actions (sign-ins, token use, deletes …). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    meta: jsonb("meta"),
  },
  (t) => [index("audit_log_owner_at_idx").on(t.ownerId, t.at.desc())],
);

/** Passkeys registered as a second factor (our own WebAuthn, verified with SimpleWebAuthn). */
export const webauthnCredentials = pgTable(
  "webauthn_credentials",
  {
    /** base64url credential id */
    id: text("id").primaryKey(),
    ownerId: ownerRef(),
    publicKey: bytea("public_key").notNull(),
    counter: bigint("counter", { mode: "number" }).notNull().default(0),
    transports: text("transports").array().notNull().default(sql`'{}'::text[]`),
    deviceType: text("device_type"),
    backedUp: boolean("backed_up").notNull().default(false),
    name: text("name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [index("webauthn_credentials_owner_idx").on(t.ownerId)],
);

/** One-time recovery codes for the passkey second factor (hashes only). */
export const mfaRecoveryCodes = pgTable(
  "mfa_recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: ownerRef(),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("mfa_recovery_codes_owner_hash_key").on(t.ownerId, t.codeHash)],
);

/** Per-owner connections to outside services. `secretEnc` is encrypted by the app. */
export const connections = pgTable(
  "connections",
  {
    ownerId: ownerRef(),
    kind: text("kind", { enum: ["ai", "email"] }).notNull(),
    provider: text("provider").notNull(),
    config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
    secretEnc: text("secret_enc"),
    secretHint: text("secret_hint"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastError: text("last_error"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: "connections_pkey", columns: [t.ownerId, t.kind] })],
);

/* ------------------------------------------------------------------ */
/*  Relations                                                          */
/* ------------------------------------------------------------------ */

export const peopleRelations = relations(people, ({ one, many }) => ({
  homeLocation: one(locations, { fields: [people.homeLocationId], references: [locations.id], relationName: "home" }),
  metLocation: one(locations, { fields: [people.metLocationId], references: [locations.id], relationName: "met" }),
  introducedBy: one(people, { fields: [people.introducedById], references: [people.id], relationName: "introducer" }),
  introduced: many(people, { relationName: "introducer" }),
  categories: many(personCategories),
  tags: many(personTags),
  activities: many(personActivities),
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

export const personActivitiesRelations = relations(personActivities, ({ one }) => ({
  person: one(people, { fields: [personActivities.personId], references: [people.id] }),
  activity: one(activities, { fields: [personActivities.activityId], references: [activities.id] }),
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
  note: one(notes, { fields: [reminders.noteId], references: [notes.id] }),
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
export type Tag = typeof tags.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type Reminder = typeof reminders.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type City = typeof cities.$inferSelect;
export type ImportItem = typeof importItems.$inferSelect;
export type InboxItem = typeof inboxItems.$inferSelect;
export type WebauthnCredential = typeof webauthnCredentials.$inferSelect;
export type Connection = typeof connections.$inferSelect;
export type { Warmth, Circle, Hobby, NoteKind };
