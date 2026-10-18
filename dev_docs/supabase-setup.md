# Supabase setup (booking sibling)

Project ref (pilot): `crxwmkegmrusndpocntu`  
URL: `https://crxwmkegmrusndpocntu.supabase.co`

## 1) Env

In `.env.local` and Vercel:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://crxwmkegmrusndpocntu.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
BOOKING_SERVICE_TOKEN=...
```

## 2) Apply schema (one-time)

SQL file: [`../supabase/migrations/20261019000000_booking_core_v0.sql`](../supabase/migrations/20261019000000_booking_core_v0.sql)

**Dashboard:** Supabase → SQL Editor → paste file → Run.

**CLI** (when logged in):

```bash
cd chatiq-booking
supabase link --project-ref crxwmkegmrusndpocntu
supabase db push
```

Tables: `contacts`, `identity_bindings`, `booking_sessions`, `catalog_items`, `bookings`.

## 3) Verify

```bash
curl -s https://chatiq-booking.vercel.app/api/health
# expect persistence: "supabase" when schema is applied + env set on Vercel
```

Until the migration is applied, the app **falls back to mock** and health reports `supabase.reachable: false`.
