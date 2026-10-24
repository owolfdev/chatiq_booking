-- Phase 3b.0 — owner catalog fields + hours/exceptions/blocks + bot settings.
-- Spec: dev_docs/service-catalog-and-availability.md
-- Weekday: 0 = Sunday … 6 = Saturday (JS getDay()).

-- Catalog: additive columns (keep existing slug/title/duration/active).
alter table public.catalog_items
  add column if not exists description text,
  add column if not exists category text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists buffer_before_minutes integer not null default 0,
  add column if not exists buffer_after_minutes integer not null default 0,
  add column if not exists capacity integer not null default 1,
  add column if not exists price_cents integer,
  add column if not exists currency text,
  add column if not exists booking_horizon_days integer,
  add column if not exists min_notice_minutes integer,
  add column if not exists updated_at timestamptz not null default now();

alter table public.catalog_items
  drop constraint if exists catalog_items_capacity_check;
alter table public.catalog_items
  add constraint catalog_items_capacity_check check (capacity >= 1);

alter table public.catalog_items
  drop constraint if exists catalog_items_duration_check;
alter table public.catalog_items
  add constraint catalog_items_duration_check check (duration_minutes > 0);

-- Bot-level booking defaults / shape enablement.
create table if not exists public.bot_booking_settings (
  team_id text not null,
  bot_id text not null,
  timezone text not null default 'Asia/Bangkok',
  booking_horizon_days integer not null default 60,
  min_notice_minutes integer not null default 60,
  slot_step_minutes integer not null default 30,
  shapes jsonb not null default '["appointments"]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, bot_id),
  constraint bot_booking_settings_horizon_check check (booking_horizon_days >= 1),
  constraint bot_booking_settings_notice_check check (min_notice_minutes >= 0),
  constraint bot_booking_settings_step_check check (slot_step_minutes >= 5)
);

-- Weekly open windows (local wall times in bot timezone).
create table if not exists public.availability_hours (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  bot_id text not null,
  weekday smallint not null,
  start_local time not null,
  end_local time not null,
  created_at timestamptz not null default now(),
  constraint availability_hours_weekday_check check (weekday between 0 and 6),
  constraint availability_hours_window_check check (end_local > start_local)
);

create index if not exists availability_hours_team_bot_idx
  on public.availability_hours (team_id, bot_id, weekday);

-- Per-date closed or special open window.
create table if not exists public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  bot_id text not null,
  on_date date not null,
  closed boolean not null default true,
  start_local time,
  end_local time,
  note text,
  created_at timestamptz not null default now(),
  unique (team_id, bot_id, on_date),
  constraint availability_exceptions_open_window_check check (
    closed = true
    or (start_local is not null and end_local is not null and end_local > start_local)
  )
);

create index if not exists availability_exceptions_team_bot_date_idx
  on public.availability_exceptions (team_id, bot_id, on_date);

-- Opaque busy intervals (timestamptz).
create table if not exists public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  bot_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint availability_blocks_range_check check (ends_at > starts_at)
);

create index if not exists availability_blocks_team_bot_range_idx
  on public.availability_blocks (team_id, bot_id, starts_at, ends_at);

-- Capacity-aware: drop bot-wide unique start index (blocks capacity > 1 / later resources).
drop index if exists public.bookings_team_bot_starts_active_uidx;

alter table public.bot_booking_settings enable row level security;
alter table public.availability_hours enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.availability_blocks enable row level security;
