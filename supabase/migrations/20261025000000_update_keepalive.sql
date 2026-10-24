-- Daily keepalive ping target for Vercel cron (Supabase idle prevention).
-- Table name is quoted because UPDATE is a SQL reserved word.

create table if not exists public."update" (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  source text not null default 'vercel_cron'
);

alter table public."update" enable row level security;

comment on table public."update" is
  'Append-only daily ping rows from /api/cron/update (Vercel cron).';
