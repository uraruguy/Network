-- v2: personal API tokens, OAuth (MCP) client grants, an audit log, chat token usage and our own
-- passkey second factor (Supabase's native WebAuthn MFA is not available on the hosted project).
-- Additive only.

-- ------------------------------------------------------------------
--  1. Personal API tokens (only a SHA-256 hash of the secret is stored)
-- ------------------------------------------------------------------
create table if not exists api_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  token_prefix text not null,
  token_hash text not null unique,
  scopes text[] not null default '{network:read}'::text[],
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists api_tokens_owner_idx on api_tokens (owner_id);

-- ------------------------------------------------------------------
--  2. OAuth clients (e.g. MCP connectors) the owner has approved
-- ------------------------------------------------------------------
create table if not exists oauth_client_grants (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id text not null,
  client_name text,
  scopes text[] not null default '{}'::text[],
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz,
  constraint oauth_client_grants_pkey primary key (owner_id, client_id)
);

-- ------------------------------------------------------------------
--  3. Audit log (append-only from the app's point of view)
-- ------------------------------------------------------------------
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  entity text,
  entity_id text,
  meta jsonb
);
create index if not exists audit_log_owner_at_idx on audit_log (owner_id, at desc);

-- ------------------------------------------------------------------
--  4. Token usage per assistant message
-- ------------------------------------------------------------------
alter table chat_messages add column if not exists usage jsonb;

-- ------------------------------------------------------------------
--  5. Passkey second factor
-- ------------------------------------------------------------------
create table if not exists webauthn_credentials (
  id text primary key, -- base64url credential id
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  public_key bytea not null,
  counter bigint not null default 0,
  transports text[] not null default '{}'::text[],
  device_type text,
  backed_up boolean not null default false,
  name text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists webauthn_credentials_owner_idx on webauthn_credentials (owner_id);

create table if not exists mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mfa_recovery_codes_owner_hash_key unique (owner_id, code_hash)
);

-- ------------------------------------------------------------------
--  6. RLS (second layer; the Data API has no table access)
-- ------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['api_tokens', 'oauth_client_grants', 'webauthn_credentials', 'mfa_recovery_codes']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists owner_all on %I', t);
    execute format('create policy owner_all on %I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
end $$;

alter table audit_log enable row level security;
drop policy if exists owner_read on audit_log;
create policy owner_read on audit_log for select to authenticated using (owner_id = auth.uid());
revoke all on audit_log from anon, authenticated;
