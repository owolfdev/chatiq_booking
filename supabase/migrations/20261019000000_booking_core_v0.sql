-- Booking sibling core schema v0
-- Applied to dedicated project (pilot). Service-role / secret key only from the app.

create extension if not exists pgcrypto;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  name text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_team_id_idx on public.contacts (team_id);

create table if not exists public.identity_bindings (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  provider text not null,
  external_id text not null,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (team_id, provider, external_id)
);

create index if not exists identity_bindings_contact_id_idx
  on public.identity_bindings (contact_id);

create table if not exists public.booking_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  bot_id text not null,
  contact_id uuid not null references public.contacts (id),
  conversation_id text,
  step text not null default 'stub_welcome',
  timezone text not null default 'Asia/Bangkok',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists booking_sessions_team_conversation_uidx
  on public.booking_sessions (team_id, conversation_id)
  where conversation_id is not null;

create index if not exists booking_sessions_team_bot_idx
  on public.booking_sessions (team_id, bot_id);

create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  bot_id text not null,
  slug text not null,
  title text not null,
  duration_minutes integer not null default 30,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (team_id, bot_id, slug)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  bot_id text not null,
  contact_id uuid not null references public.contacts (id),
  session_id uuid references public.booking_sessions (id),
  catalog_item_id uuid references public.catalog_items (id),
  status text not null default 'pending',
  starts_at timestamptz,
  timezone text not null default 'Asia/Bangkok',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_status_check
    check (status in ('pending', 'confirmed', 'cancelled'))
);

create index if not exists bookings_team_bot_starts_idx
  on public.bookings (team_id, bot_id, starts_at);

-- Deny anon/authenticated by default; app uses secret key (bypasses RLS).
alter table public.contacts enable row level security;
alter table public.identity_bindings enable row level security;
alter table public.booking_sessions enable row level security;
alter table public.catalog_items enable row level security;
alter table public.bookings enable row level security;
