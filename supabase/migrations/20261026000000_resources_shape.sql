-- Resources shape — people/rooms, eligibility, booking.resource_id.
-- Spec: base-and-shape-modules.md (clinic any / specific; one resource per booking).
-- Multi-resource linking (staff + room together) is intentionally out of scope.

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  bot_id text not null,
  slug text not null,
  title text not null,
  kind text not null default 'person',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, bot_id, slug),
  constraint resources_kind_check check (kind in ('person', 'room', 'other'))
);

create index if not exists resources_team_bot_active_idx
  on public.resources (team_id, bot_id, active, sort_order);

-- Which resources may deliver which catalog service.
create table if not exists public.service_resources (
  catalog_item_id uuid not null references public.catalog_items (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (catalog_item_id, resource_id)
);

create index if not exists service_resources_resource_idx
  on public.service_resources (resource_id);

alter table public.bookings
  add column if not exists resource_id uuid references public.resources (id) on delete set null;

create index if not exists bookings_team_bot_resource_starts_idx
  on public.bookings (team_id, bot_id, resource_id, starts_at)
  where resource_id is not null
    and status in ('pending', 'confirmed');

alter table public.resources enable row level security;
alter table public.service_resources enable row level security;
