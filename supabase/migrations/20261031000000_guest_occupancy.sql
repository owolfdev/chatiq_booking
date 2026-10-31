-- Stay occupancy: max guests per room type (policy) + guest_count on bookings.
-- Distinct from catalog_items.capacity (concurrent inventory of that room type).

alter table public.catalog_items
  add column if not exists max_guests integer not null default 2;

alter table public.catalog_items
  drop constraint if exists catalog_items_max_guests_check;
alter table public.catalog_items
  add constraint catalog_items_max_guests_check check (max_guests >= 1);

alter table public.bookings
  add column if not exists guest_count integer;

alter table public.bookings
  drop constraint if exists bookings_guest_count_check;
alter table public.bookings
  add constraint bookings_guest_count_check
  check (guest_count is null or guest_count >= 1);
