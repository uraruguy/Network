-- v2: full-text search over people and notes.
--
-- Notes mix colloquial Slovenian and English, so there is no language-specific stemming: the
-- `network` configuration lower-cases and strips accents ("Čevapi" matches "cevapi") and keeps
-- every word. Prefix matching is done in the query (see src/lib/data/search-query.ts).
-- Additive only: the v1 app never selects the new generated columns.

-- ------------------------------------------------------------------
--  1. Text search configuration + immutable helpers
-- ------------------------------------------------------------------
do $$
declare
  ext_schema text;
begin
  select n.nspname into ext_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'unaccent';
  if ext_schema is null then
    raise exception 'The unaccent extension is required';
  end if;

  if not exists (select 1 from pg_ts_config c join pg_namespace n on n.oid = c.cfgnamespace where n.nspname = 'public' and c.cfgname = 'network') then
    create text search configuration public.network (copy = simple);
  end if;
  execute format(
    'alter text search configuration public.network alter mapping for hword, hword_part, word with %I.unaccent, simple',
    ext_schema
  );

  -- unaccent() is only STABLE (its dictionary could change); pinning the dictionary makes it safe
  -- to use in index expressions.
  execute format($f$
    create or replace function private.f_unaccent(value text)
    returns text language sql immutable strict parallel safe as $body$
      select %I.unaccent(%L::regdictionary, value)
    $body$
  $f$, ext_schema, ext_schema || '.unaccent');
end $$;

-- array_to_string() is only STABLE; for text[] it is effectively immutable.
create or replace function private.join_text(value text[])
returns text language sql immutable parallel safe as $$
  select coalesce(array_to_string(value, ' '), '')
$$;

-- Used inside generated columns and index expressions. Only the app's own connection (postgres)
-- writes these tables; the Data API roles have no table access at all.
revoke all on function private.f_unaccent(text) from public;
revoke all on function private.join_text(text[]) from public;
grant usage on schema private to postgres;
grant execute on function private.f_unaccent(text) to postgres;
grant execute on function private.join_text(text[]) to postgres;

-- ------------------------------------------------------------------
--  2. Notes: title (A) + body (B)
-- ------------------------------------------------------------------
alter table notes add column if not exists search tsvector
  generated always as (
    setweight(to_tsvector('public.network', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('public.network', coalesce(content_text, '')), 'B')
  ) stored;
create index if not exists notes_search_idx on notes using gin (search);

-- ------------------------------------------------------------------
--  3. People: name (A), company + headline (B), context fields (C)
-- ------------------------------------------------------------------
alter table people add column if not exists search tsvector
  generated always as (
    setweight(to_tsvector('public.network', coalesce(display_name, '')), 'A') ||
    setweight(to_tsvector('public.network', coalesce(company, '') || ' ' || coalesce(headline, '')), 'B') ||
    setweight(to_tsvector('public.network',
      coalesce(met_context, '') || ' ' ||
      coalesce(how_i_can_help, '') || ' ' ||
      coalesce(what_i_can_ask, '') || ' ' ||
      private.join_text(interests)
    ), 'C')
  ) stored;
create index if not exists people_search_idx on people using gin (search);

-- Fuzzy / substring name matching ("ingo", "kiedeisch"), accent-insensitive.
create index if not exists people_name_unaccent_trgm_idx on people using gin (private.f_unaccent(lower(display_name)) gin_trgm_ops);
