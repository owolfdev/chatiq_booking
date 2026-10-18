-- Prevent double-booking the same start time per team/bot (active bookings only).
-- Keep the earliest booking when duplicates already exist; cancel the rest.

with ranked as (
  select
    id,
    row_number() over (
      partition by team_id, bot_id, starts_at
      order by created_at asc, id asc
    ) as rn
  from public.bookings
  where starts_at is not null
    and status in ('pending', 'confirmed')
)
update public.bookings b
set
  status = 'cancelled',
  updated_at = now(),
  notes = coalesce(notes || E'\n', '') || 'auto-cancelled: duplicate slot'
from ranked r
where b.id = r.id
  and r.rn > 1;

create unique index if not exists bookings_team_bot_starts_active_uidx
  on public.bookings (team_id, bot_id, starts_at)
  where starts_at is not null
    and status in ('pending', 'confirmed');
