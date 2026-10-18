-- Security hardening.
-- The app talks to Postgres directly (Drizzle over DATABASE_URL) and uses Supabase only for Auth,
-- so nothing in the public schema needs to be reachable through the Data API (PostgREST).

-- ------------------------------------------------------------------
--  1. Digest helpers move to a private schema the Data API never exposes.
-- ------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.ping_digest()
returns void language plpgsql security definer set search_path = public as $$
declare
  url text; secret text;
begin
  select value into url from app_settings where key = 'app_url';
  select value into secret from app_settings where key = 'cron_secret';
  if url is null or secret is null then return; end if;
  perform net.http_post(
    url := url || '/api/cron/reminders',
    headers := jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end $$;

-- Run once after deploying (SQL editor or psql as postgres):
--   select private.set_digest_target('https://<your-app>.vercel.app', '<CRON_SECRET>');
create or replace function private.set_digest_target(app_url text, cron_secret text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into app_settings(key, value) values ('app_url', app_url) on conflict (key) do update set value = excluded.value;
  insert into app_settings(key, value) values ('cron_secret', cron_secret) on conflict (key) do update set value = excluded.value;
  perform cron.unschedule(jobid) from cron.job where jobname = 'network-digest';
  perform cron.schedule('network-digest', '5 * * * *', $job$ select private.ping_digest(); $job$);
end $$;

revoke all on all functions in schema private from public, anon, authenticated;

-- Re-point an existing hourly job at the private function.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'network-digest';
    if exists (select 1 from app_settings where key = 'app_url') and exists (select 1 from app_settings where key = 'cron_secret') then
      perform cron.schedule('network-digest', '5 * * * *', $job$ select private.ping_digest(); $job$);
    end if;
  end if;
end $$;

drop function if exists public.ping_digest();
drop function if exists public.set_digest_target(text, text);

-- ------------------------------------------------------------------
--  2. No Data API access to app tables (RLS stays on as a second layer).
-- ------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- ------------------------------------------------------------------
--  3. Our own functions are not callable through the Data API.
--     Auth triggers run as supabase_auth_admin, so it keeps execute.
-- ------------------------------------------------------------------
do $$
declare
  f regprocedure;
  has_auth_admin boolean := exists (select 1 from pg_roles where rolname = 'supabase_auth_admin');
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proowner = (select oid from pg_roles where rolname = current_user)
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
    if has_auth_admin then
      execute format('grant execute on function %s to supabase_auth_admin', f);
    end if;
  end loop;
end $$;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
