-- v2: user-editable activities (replace the fixed hobby list), usable tags, follow-up trigger,
-- filter indexes.
--
-- Backward compatible with the v1 app that keeps running against this database until release:
-- nothing it reads or writes is dropped or renamed. `people.hobbies` / `people.hobbies_other`
-- stay (v2 code no longer writes them); re-run `select private.backfill_person_activities();`
-- at release time to pick up hobby edits made through the v1 app in the meantime.

-- ------------------------------------------------------------------
--  1. Activities (things you do together: football, dinners, hiking …)
-- ------------------------------------------------------------------
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  slug text not null,
  emoji text,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_owner_slug_key unique (owner_id, slug)
);

create table if not exists person_activities (
  person_id uuid not null references people (id) on delete cascade,
  activity_id uuid not null references activities (id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  constraint person_activities_pkey primary key (person_id, activity_id)
);
create index if not exists person_activities_activity_idx on person_activities (activity_id);

-- Default activity set for an owner. Idempotent: existing slugs are left alone.
create or replace function private.seed_activities(owner uuid)
returns void language sql security definer set search_path = public as $$
  insert into activities (owner_id, slug, name, emoji, sort) values
    (owner, 'football',             'Football',             '⚽️',  1),
    (owner, 'basketball',           'Basketball',           '🏀',  2),
    (owner, 'hiking',               'Hiking',               '🥾',  3),
    (owner, 'skiing',               'Skiing',               '⛷️',  4),
    (owner, 'cross-country-skiing', 'Cross-country skiing', '🎿',  5),
    (owner, 'running',              'Running',              '🏃',  6),
    (owner, 'dinners',              'Dinners',              '🍽️',  7),
    (owner, 'drinks',               'Drinks',               '🍸',  8),
    (owner, 'partying',             'Partying',             '🪩',  9),
    (owner, 'hanging-out',          'Hanging out',          '🛋️', 10),
    (owner, 'walking',              'Walking',              '🚶', 11),
    (owner, 'gym',                  'Gym',                  '🏋️', 12),
    (owner, 'padel',                'Padel',                '🎾', 13),
    (owner, 'coffee',               'Coffee',               '☕️', 14),
    (owner, 'lunch',                'Lunch',                '🥪', 15),
    (owner, 'cycling',              'Cycling',              '🚴', 16),
    (owner, 'tennis',               'Tennis',               '🎾', 17),
    (owner, 'climbing',             'Climbing',             '🧗', 18),
    (owner, 'travel',               'Travel',               '✈️', 19),
    (owner, 'concerts',             'Concerts',             '🎶', 20),
    (owner, 'board-games',          'Board games',          '🎲', 21),
    (owner, 'swimming',             'Swimming',             '🏊', 22)
  on conflict (owner_id, slug) do nothing;
$$;

-- URL-safe slug, accent-insensitive ("Čaj s prijatelji" → "caj-s-prijatelji").
do $$
declare ext_schema text;
begin
  select n.nspname into ext_schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'unaccent';
  execute format($f$
    create or replace function private.slugify(value text)
    returns text language sql immutable strict parallel safe as $body$
      select trim(both '-' from regexp_replace(lower(%I.unaccent(%L::regdictionary, value)), '[^a-z0-9]+', '-', 'g'))
    $body$
  $f$, ext_schema, ext_schema || '.unaccent');
end $$;

-- Copies the legacy fixed hobbies (people.hobbies + free-text hobbies_other) into person_activities.
-- Idempotent; safe to run again at any time.
create or replace function private.backfill_person_activities()
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Free-text "other" hobbies become activities of their own.
  insert into activities (owner_id, slug, name, sort)
  select distinct on (p.owner_id, private.slugify(btrim(part)))
         p.owner_id, private.slugify(btrim(part)), btrim(part), 100
  from people p
  cross join lateral regexp_split_to_table(coalesce(p.hobbies_other, ''), '[,;]') as part
  where btrim(part) <> '' and private.slugify(btrim(part)) <> ''
  on conflict (owner_id, slug) do nothing;

  -- Fixed hobbies map 1:1 onto seeded activity slugs.
  insert into person_activities (person_id, activity_id, owner_id)
  select p.id, a.id, p.owner_id
  from people p
  cross join lateral unnest(p.hobbies) as h(slug)
  join activities a on a.owner_id = p.owner_id and a.slug = h.slug
  where h.slug <> 'other'
  on conflict do nothing;

  insert into person_activities (person_id, activity_id, owner_id)
  select p.id, a.id, p.owner_id
  from people p
  cross join lateral regexp_split_to_table(coalesce(p.hobbies_other, ''), '[,;]') as part
  join activities a on a.owner_id = p.owner_id and a.slug = private.slugify(btrim(part))
  where btrim(part) <> ''
  on conflict do nothing;
end $$;

revoke all on function private.seed_activities(uuid) from public;
revoke all on function private.slugify(text) from public;
revoke all on function private.backfill_person_activities() from public;

-- New owners get the default activities too (keeps the existing profile + categories behaviour).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  insert into categories (owner_id, name, slug, color, icon, sort) values
    (new.id, 'Mentor',           'mentor',    '#7c5cff', 'graduation-cap', 1),
    (new.id, 'Friend',           'friend',    '#ff6b6b', 'heart',          2),
    (new.id, 'Business partner', 'partner',   '#0fb5ba', 'handshake',      3),
    (new.id, 'Investor',         'investor',  '#f4b942', 'trending-up',    4),
    (new.id, 'Client',           'client',    '#3b82f6', 'briefcase',      5),
    (new.id, 'Peer founder',     'founder',   '#12a594', 'rocket',         6),
    (new.id, 'Acquaintance',     'acquaint',  '#9aa9ab', 'user',           7)
  on conflict do nothing;

  perform private.seed_activities(new.id);
  return new;
end $$;

-- Same grants as the security-hardening migration: only the auth trigger path may execute it.
do $$
begin
  revoke execute on function public.handle_new_user() from public, anon, authenticated;
  grant execute on function public.handle_new_user() to service_role;
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.handle_new_user() to supabase_auth_admin;
  end if;
end $$;

-- Existing owners: seed + backfill once.
select private.seed_activities(id) from profiles;
select private.backfill_person_activities();

-- ------------------------------------------------------------------
--  2. Tags: case-insensitive uniqueness, colour, reverse lookup index
-- ------------------------------------------------------------------
alter table tags add column if not exists color text;

-- Merge tags that only differ by case (v1 never wrote tags, so this is normally a no-op).
with ranked as (
  select id, first_value(id) over (partition by owner_id, lower(name) order by created_at, id) as keep_id
  from tags
),
moved as (
  insert into person_tags (person_id, tag_id, owner_id)
  select pt.person_id, r.keep_id, pt.owner_id
  from person_tags pt join ranked r on r.id = pt.tag_id
  where r.id <> r.keep_id
  on conflict do nothing
  returning 1
)
delete from tags t using ranked r where t.id = r.id and r.id <> r.keep_id;

create unique index if not exists tags_owner_lower_name_uidx on tags (owner_id, lower(name));
-- The lower(name) index is strictly stronger; v1 never upserted tags, so the old one can go.
drop index if exists tags_owner_name_uidx;
create index if not exists person_tags_tag_idx on person_tags (tag_id);

-- ------------------------------------------------------------------
--  3. Small additive columns
-- ------------------------------------------------------------------
-- Local date of the last digest e-mail (replaces "any reminder sent today" detection).
alter table profiles add column if not exists last_digest_on date;

-- A follow-up can point at the note it came from.
alter table reminders add column if not exists note_id uuid references notes (id) on delete set null;
create index if not exists reminders_note_idx on reminders (note_id) where note_id is not null;

-- ------------------------------------------------------------------
--  4. people.next_followup_at is maintained by the database
-- ------------------------------------------------------------------
create or replace function public.sync_next_followup()
returns trigger language plpgsql set search_path = public as $$
declare
  ids uuid[];
begin
  if tg_op = 'DELETE' then
    ids := array[old.person_id];
  elsif tg_op = 'INSERT' then
    ids := array[new.person_id];
  else
    if new.person_id is not distinct from old.person_id
       and new.due_at is not distinct from old.due_at
       and new.status is not distinct from old.status then
      return null;
    end if;
    ids := array[old.person_id, new.person_id];
  end if;

  update people p
     set next_followup_at = (
       select min(r.due_at) from reminders r
        where r.person_id = p.id and r.status in ('pending', 'sent', 'snoozed')
     )
   where p.id = any (ids);
  return null;
end $$;

drop trigger if exists sync_next_followup on reminders;
create trigger sync_next_followup
  after insert or update or delete on reminders
  for each row execute function public.sync_next_followup();

-- ------------------------------------------------------------------
--  5. Indexes for list filters and timelines
-- ------------------------------------------------------------------
create index if not exists person_categories_category_idx on person_categories (category_id);
create index if not exists people_owner_recent_idx on people (owner_id, (coalesce(last_interaction_at, created_at)) desc, id) where deleted_at is null;
create index if not exists people_owner_warmth_idx on people (owner_id, warmth) where deleted_at is null;
create index if not exists locations_owner_country_idx on locations (owner_id, country_code);
create index if not exists notes_person_timeline_idx on notes (person_id, occurred_at desc) where deleted_at is null;
create index if not exists notes_owner_timeline_idx on notes (owner_id, occurred_at desc) where deleted_at is null;

-- ------------------------------------------------------------------
--  6. RLS + updated_at (same conventions as the init migration)
-- ------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['activities', 'person_activities']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists owner_all on %I', t);
    execute format('create policy owner_all on %I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
end $$;

drop trigger if exists touch_updated_at on activities;
create trigger touch_updated_at before update on activities for each row execute function public.touch_updated_at();

revoke execute on function public.sync_next_followup() from public, anon, authenticated;
