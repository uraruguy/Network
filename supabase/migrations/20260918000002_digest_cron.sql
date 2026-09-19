-- Hourly digest trigger via pg_cron + pg_net (Supabase cloud). Locally these extensions may
-- be unavailable, so everything is guarded.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Stores the deployed app URL + cron secret so the job can call /api/cron/reminders.
-- Set after deploy:  select set_digest_target('https://the-network.vercel.app', 'CRON_SECRET');
create or replace function public.set_digest_target(app_url text, cron_secret text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into app_settings(key, value) values ('app_url', app_url) on conflict (key) do update set value = excluded.value;
  insert into app_settings(key, value) values ('cron_secret', cron_secret) on conflict (key) do update set value = excluded.value;
  perform cron.unschedule(jobid) from cron.job where jobname = 'network-digest';
  perform cron.schedule('network-digest', '5 * * * *', $job$ select public.ping_digest(); $job$);
end $$;

create or replace function public.ping_digest()
returns void language plpgsql security definer set search_path = public as $$
declare
  url text; secret text;
begin
  select value into url from app_settings where key = 'app_url';
  select value into secret from app_settings where key = 'cron_secret';
  if url is null or secret is null then return; end if;
  perform net.http_post(
    url := url || '/api/cron/reminders',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end $$;
