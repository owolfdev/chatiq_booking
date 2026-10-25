-- Multi-resource linking — a booking can hold person + room (etc.) together.
-- Service opt-in via catalog_items.require_resource_kinds (e.g. ["person","room"]).
-- bookings.resource_id remains the primary (prefer person) for backward compat.

alter table public.catalog_items
  add column if not exists require_resource_kinds jsonb not null default '[]'::jsonb;

create table if not exists public.booking_resources (
  booking_id uuid not null references public.bookings (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete restrict,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (booking_id, resource_id),
  constraint booking_resources_kind_check check (kind in ('person', 'room', 'other'))
);

create index if not exists booking_resources_resource_idx
  on public.booking_resources (resource_id);

-- Backfill: existing single-resource bookings → junction rows.
insert into public.booking_resources (booking_id, resource_id, kind)
select b.id, b.resource_id, coalesce(r.kind, 'person')
from public.bookings b
left join public.resources r on r.id = b.resource_id
where b.resource_id is not null
on conflict do nothing;

alter table public.booking_resources enable row level security;
