-- Import resolution: people-first entity resolution for the Apple Notes import.
-- Additive only — production keeps running the previous code against these tables.
--
--   import_items      + source, folders[], screened_with, extraction_version, gone_at, note_id, dismissed_reason
--   import_people     one proposal per real person (resolved across all notes)
--   import_mentions   every candidate mention → proposal, plus the note's filing role
--   import_commit_log every row a commit inserted/updated, with the previous values (rollback)
--   reminders         + source_kind, source_ref (idempotent imported reminders)
--   notes             unique (owner_id, source_kind, source_ref) for live rows (idempotent imported notes)

-- ------------------------------------------------------------------
--  import_items
-- ------------------------------------------------------------------
alter table import_items
  add column if not exists source text not null default 'apple-notes',
  add column if not exists folders text[] not null default '{}'::text[],
  add column if not exists screened_with text,
  add column if not exists extraction_version integer,
  add column if not exists gone_at timestamptz,
  add column if not exists note_id uuid references notes(id) on delete set null,
  add column if not exists dismissed_reason text;

update import_items i set source = j.source from import_jobs j where j.id = i.job_id and i.source is distinct from j.source;
update import_items set folders = array[folder] where folder is not null and folder <> '' and folders = '{}'::text[];
-- Skips by the first run's screen (700-char head, OpenRouter) vs. notes Jakob skipped by hand in the old review UI.
update import_items set screened_with = 'head700:openrouter'
 where status = 'skipped' and screened_with is null and coalesce(classification, 'not_people') = 'not_people';
update import_items set dismissed_reason = case when coalesce(classification, 'not_people') = 'not_people' then 'screen:not_people' else 'user:skipped' end
 where status = 'skipped' and dismissed_reason is null;
update import_items set extraction_version = 1 where candidates ? 'candidates' and extraction_version is null;
-- Old-flow commits recorded the note id inside decision.
update import_items set note_id = (decision->>'noteId')::uuid
 where status = 'committed' and note_id is null and decision ? 'noteId' and decision->>'noteId' ~ '^[0-9a-f-]{36}$'
   and exists (select 1 from notes n where n.id = (decision->>'noteId')::uuid);

create index if not exists import_items_owner_source_status_idx on import_items (owner_id, source, status);

-- ------------------------------------------------------------------
--  import_people
-- ------------------------------------------------------------------
do $$ begin
  create type "public"."import_person_status" as enum ('proposed', 'approved', 'rejected', 'merged', 'committed');
exception when duplicate_object then null; end $$;

create table if not exists import_people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  source text not null default 'apple-notes',
  key text not null,
  display_name text not null,
  aliases text[] not null default '{}'::text[],
  disposition text not null default 'person' check (disposition in ('person', 'passerby', 'not_person', 'self')),
  profile jsonb not null default '{}'::jsonb,
  confidence real,
  reasons text,
  review_flags text[] not null default '{}'::text[],
  needs_review boolean not null default true,
  status "public"."import_person_status" not null default 'proposed',
  decided_by text check (decided_by in ('auto', 'user')),
  decided_at timestamptz,
  match_person_id uuid references people(id) on delete set null,
  merged_into_id uuid references import_people(id) on delete set null,
  committed_person_id uuid references people(id) on delete set null,
  create_reminder boolean not null default true,
  engine text,
  proposal_file text,
  -- Previous decision states (newest last), so a review decision can be undone.
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_people_owner_source_key_uidx unique (owner_id, source, key)
);
create index if not exists import_people_review_idx on import_people (owner_id, source, status, needs_review);
create index if not exists import_people_match_idx on import_people (match_person_id);
create index if not exists import_people_committed_idx on import_people (committed_person_id);

-- ------------------------------------------------------------------
--  import_mentions
-- ------------------------------------------------------------------
create table if not exists import_mentions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  item_id uuid not null references import_items(id) on delete cascade,
  candidate_index integer,
  surface text not null,
  import_person_id uuid references import_people(id) on delete set null,
  original_import_person_id uuid references import_people(id) on delete set null,
  role text not null default 'mention' check (role in ('primary', 'mention', 'listed', 'excerpt')),
  confidence real,
  reason text,
  evidence text,
  excerpt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists import_mentions_item_candidate_uidx on import_mentions (item_id, candidate_index) where candidate_index is not null;
create unique index if not exists import_mentions_item_primary_uidx on import_mentions (item_id) where role = 'primary';
create index if not exists import_mentions_person_idx on import_mentions (import_person_id);
create index if not exists import_mentions_owner_idx on import_mentions (owner_id);

-- ------------------------------------------------------------------
--  import_commit_log
-- ------------------------------------------------------------------
create table if not exists import_commit_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid(),
  commit_id uuid not null,
  source text not null default 'apple-notes',
  import_person_id uuid,
  item_id uuid,
  table_name text not null,
  row_key jsonb not null,
  op text not null check (op in ('insert', 'update')),
  before jsonb,
  created_at timestamptz not null default now()
);
create index if not exists import_commit_log_commit_idx on import_commit_log (owner_id, commit_id, id);
create index if not exists import_commit_log_source_idx on import_commit_log (owner_id, source, id);

-- ------------------------------------------------------------------
--  reminders: provenance for imported reminders
-- ------------------------------------------------------------------
alter table reminders
  add column if not exists source_kind text,
  add column if not exists source_ref text;
create unique index if not exists reminders_owner_source_uidx on reminders (owner_id, source_kind, source_ref)
  where source_ref is not null;

-- ------------------------------------------------------------------
--  notes: one live note per source ref
--  Guard: older imports could have produced duplicates; keep the oldest live row as the canonical
--  owner of the ref and suffix the others (nothing is deleted).
-- ------------------------------------------------------------------
with ranked as (
  select id, row_number() over (partition by owner_id, source_kind, source_ref order by created_at, id) as rn
  from notes
  where source_ref is not null and deleted_at is null
)
update notes n set source_ref = n.source_ref || '#dup-' || n.id
from ranked r
where r.id = n.id and r.rn > 1;

create unique index if not exists notes_owner_source_uidx on notes (owner_id, source_kind, source_ref)
  where source_ref is not null and deleted_at is null;

-- ------------------------------------------------------------------
--  updated_at + RLS (same pattern as init)
-- ------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['import_people', 'import_mentions']
  loop
    execute format('drop trigger if exists touch_updated_at on %I', t);
    execute format('create trigger touch_updated_at before update on %I for each row execute function public.touch_updated_at()', t);
  end loop;
  foreach t in array array['import_people', 'import_mentions', 'import_commit_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists owner_all on %I', t);
    execute format('create policy owner_all on %I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
    -- Security hardening (20261017000000): no Data API access to app tables.
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
end $$;
