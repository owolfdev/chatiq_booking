-- Stays shape — night ranges via bookings.ends_at.
-- Spec: base-and-shape-modules.md (hotel inventory by room-type capacity).
-- Catalog item = room type; capacity = how many overlapping stays of that type.

alter table public.bookings
  add column if not exists ends_at timestamptz;

alter table public.bookings
  drop constraint if exists bookings_ends_at_check;
alter table public.bookings
  add constraint bookings_ends_at_check
  check (ends_at is null or starts_at is null or ends_at > starts_at);

create index if not exists bookings_team_bot_stay_range_idx
  on public.bookings (team_id, bot_id, catalog_item_id, starts_at, ends_at)
  where ends_at is not null
    and status in ('pending', 'confirmed');
