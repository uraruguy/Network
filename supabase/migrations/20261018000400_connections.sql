-- v2: per-owner connections to outside services (AI provider, e-mail sender).
-- Secrets are encrypted by the app (key derived from APP_SECRET) before they reach the database;
-- `secret_hint` keeps the last few characters for display. Additive only.

create table if not exists connections (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('ai', 'email')),
  provider text not null,
  config jsonb not null default '{}'::jsonb,
  secret_enc text,
  secret_hint text,
  verified_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  constraint connections_pkey primary key (owner_id, kind)
);

alter table connections enable row level security;
drop policy if exists owner_all on connections;
create policy owner_all on connections for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on connections from anon, authenticated;

drop trigger if exists touch_updated_at on connections;
create trigger touch_updated_at before update on connections for each row execute function public.touch_updated_at();
