-- Identity & account linking (Phase 3a)
-- Spec: dev_docs/identity-and-account-linking.md
-- A merge proves control of BOTH channel accounts: one-time connect token
-- issued at one door, redeemed (with fresh login) at the other.

-- Losing contact in a merge points at the survivor; never deleted.
alter table public.contacts
  add column if not exists merged_into uuid references public.contacts (id),
  add column if not exists merged_at timestamptz;

create index if not exists contacts_merged_into_idx
  on public.contacts (merged_into)
  where merged_into is not null;

-- One-time connect tokens. Only hashes are stored; plaintext is shown once
-- at issuance (long token for links, short code for manual entry).
create table if not exists public.connect_tokens (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  bot_id text not null,
  issuing_contact_id uuid not null references public.contacts (id) on delete cascade,
  token_hash text not null,
  short_code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  redeemed_contact_id uuid references public.contacts (id),
  created_at timestamptz not null default now(),
  unique (token_hash)
);

create index if not exists connect_tokens_team_bot_code_idx
  on public.connect_tokens (team_id, bot_id, short_code_hash)
  where consumed_at is null;

create index if not exists connect_tokens_issuing_contact_idx
  on public.connect_tokens (issuing_contact_id);

-- Append-only audit for identity merges/unmerges.
create table if not exists public.identity_audit_log (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  bot_id text not null,
  action text not null
    check (action in ('merge', 'unmerge')),
  survivor_contact_id uuid not null references public.contacts (id),
  merged_contact_id uuid not null references public.contacts (id),
  actor_type text not null default 'customer',
  actor_id text,
  token_id uuid references public.connect_tokens (id),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists identity_audit_log_team_idx
  on public.identity_audit_log (team_id, created_at desc);

alter table public.connect_tokens enable row level security;
alter table public.identity_audit_log enable row level security;
