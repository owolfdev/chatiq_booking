-- Phase 3b — append-only audit for mutating commands (actor + before→after).

create table if not exists public.command_audit_log (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  bot_id text not null,
  command text not null,
  actor_type text not null,
  actor_id text,
  via text not null default 'api'
    check (via in ('ui', 'llm', 'api', 'system', 'cron')),
  contact_id uuid references public.contacts (id),
  ok boolean not null default true,
  error_code text,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  slots_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists command_audit_log_team_created_idx
  on public.command_audit_log (team_id, created_at desc);

create index if not exists command_audit_log_team_bot_created_idx
  on public.command_audit_log (team_id, bot_id, created_at desc);

create index if not exists command_audit_log_command_idx
  on public.command_audit_log (team_id, command, created_at desc);

alter table public.command_audit_log enable row level security;
