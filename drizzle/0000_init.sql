CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant', 'system', 'tool');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('pending', 'classified', 'extracted', 'approved', 'skipped', 'committed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."inbox_status" AS ENUM('new', 'proposed', 'applied', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."note_kind" AS ENUM('note', 'meeting', 'call', 'message');--> statement-breakpoint
CREATE TYPE "public"."recurrence" AS ENUM('none', 'monthly', 'quarterly', 'semiannual', 'yearly', 'custom_days');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('pending', 'sent', 'done', 'snoozed');--> statement-breakpoint
CREATE TYPE "public"."warmth" AS ENUM('inner', 'active', 'dormant', 'archive');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"color" text NOT NULL,
	"icon" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" "chat_role" NOT NULL,
	"parts" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"title" text,
	"person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ascii_name" text NOT NULL,
	"admin" text,
	"country" text NOT NULL,
	"country_code" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"population" integer,
	"timezone" text
);
--> statement-breakpoint
CREATE TABLE "import_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"job_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"external_uuid" text,
	"title" text,
	"html" text,
	"text" text DEFAULT '' NOT NULL,
	"folder" text,
	"external_created_at" timestamp with time zone,
	"external_modified_at" timestamp with time zone,
	"content_hash" text,
	"classification" text,
	"classification_confidence" double precision,
	"candidates" jsonb,
	"decision" jsonb,
	"status" "import_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"source" text DEFAULT 'apple-notes' NOT NULL,
	"label" text,
	"total_items" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"text" text NOT NULL,
	"source" text DEFAULT 'shortcut' NOT NULL,
	"status" "inbox_status" DEFAULT 'new' NOT NULL,
	"proposal" jsonb,
	"applied_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"name" text NOT NULL,
	"admin" text,
	"country" text NOT NULL,
	"country_code" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"timezone" text,
	"city_id" integer,
	"source" text DEFAULT 'cities' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_mentions" (
	"note_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	CONSTRAINT "note_mentions_note_id_person_id_pk" PRIMARY KEY("note_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"person_id" uuid NOT NULL,
	"title" text,
	"content_json" jsonb,
	"content_md" text DEFAULT '' NOT NULL,
	"content_text" text DEFAULT '' NOT NULL,
	"kind" "note_kind" DEFAULT 'note' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"source_kind" text,
	"source_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"display_name" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"avatar_url" text,
	"headline" text,
	"company" text,
	"home_location_id" uuid,
	"met_context" text,
	"met_at" date,
	"met_location_id" uuid,
	"introduced_by_id" uuid,
	"warmth" "warmth" DEFAULT 'active' NOT NULL,
	"email" text,
	"phone" text,
	"linkedin" text,
	"x_handle" text,
	"instagram" text,
	"website" text,
	"birthday" date,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"interests" text[] DEFAULT '{}'::text[] NOT NULL,
	"how_i_can_help" text,
	"what_i_can_ask" text,
	"ai_summary" text,
	"ai_summary_at" timestamp with time zone,
	"last_interaction_at" timestamp with time zone,
	"next_followup_at" timestamp with time zone,
	"followup_cadence_days" integer,
	"source_kind" text,
	"source_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "person_categories" (
	"person_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	CONSTRAINT "person_categories_person_id_category_id_pk" PRIMARY KEY("person_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "person_tags" (
	"person_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	CONSTRAINT "person_tags_person_id_tag_id_pk" PRIMARY KEY("person_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"timezone" text DEFAULT 'Europe/Ljubljana' NOT NULL,
	"home_location_id" uuid,
	"digest_hour" integer DEFAULT 7 NOT NULL,
	"digest_enabled" boolean DEFAULT true NOT NULL,
	"inbox_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"person_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"message" text,
	"recurrence" "recurrence" DEFAULT 'none' NOT NULL,
	"recurrence_days" integer,
	"status" "reminder_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_items" ADD CONSTRAINT "import_items_job_id_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_mentions" ADD CONSTRAINT "note_mentions_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_mentions" ADD CONSTRAINT "note_mentions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_home_location_id_locations_id_fk" FOREIGN KEY ("home_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_met_location_id_locations_id_fk" FOREIGN KEY ("met_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_categories" ADD CONSTRAINT "person_categories_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_categories" ADD CONSTRAINT "person_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_tags" ADD CONSTRAINT "person_tags_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_tags" ADD CONSTRAINT "person_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_owner_slug_uidx" ON "categories" USING btree ("owner_id","slug");--> statement-breakpoint
CREATE INDEX "chat_messages_thread_idx" ON "chat_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "cities_ascii_name_idx" ON "cities" USING btree ("ascii_name");--> statement-breakpoint
CREATE INDEX "cities_population_idx" ON "cities" USING btree ("population");--> statement-breakpoint
CREATE INDEX "import_items_job_idx" ON "import_items" USING btree ("job_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "import_items_owner_external_uidx" ON "import_items" USING btree ("owner_id","external_id");--> statement-breakpoint
CREATE INDEX "inbox_owner_status_idx" ON "inbox_items" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "locations_owner_idx" ON "locations" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_owner_city_uidx" ON "locations" USING btree ("owner_id","city_id");--> statement-breakpoint
CREATE INDEX "notes_owner_idx" ON "notes" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "notes_person_idx" ON "notes" USING btree ("person_id","occurred_at");--> statement-breakpoint
CREATE INDEX "people_owner_idx" ON "people" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "people_owner_name_idx" ON "people" USING btree ("owner_id","display_name");--> statement-breakpoint
CREATE INDEX "people_home_location_idx" ON "people" USING btree ("home_location_id");--> statement-breakpoint
CREATE INDEX "people_next_followup_idx" ON "people" USING btree ("next_followup_at");--> statement-breakpoint
CREATE INDEX "reminders_owner_due_idx" ON "reminders" USING btree ("owner_id","status","due_at");--> statement-breakpoint
CREATE INDEX "reminders_person_idx" ON "reminders" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_owner_name_uidx" ON "tags" USING btree ("owner_id","name");