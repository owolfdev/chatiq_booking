# chatiq-booking

Isolated booking **engine** for ChatIQ. Core chat stays safe: ChatIQ calls this app over HTTPS only when a bot is gated on and the sibling runtime is enabled.

**Operators:** configure schedule and settings in **ChatIQ** (`/dashboard/bots/[slug]/booking`). Sibling `/admin` is **ops/pilot only** (service token) — not the subscriber product surface. Spec: [`dev_docs/chatiq-booking-operator-ui.md`](./dev_docs/chatiq-booking-operator-ui.md).

## Local

```bash
cp .env.example .env.local
npm install
npm run dev   # http://localhost:3003
```

- Health: `GET /api/health`
- Turn stub: `POST /api/v1/turns/handle` with `Authorization: Bearer <BOOKING_SERVICE_TOKEN>`

## Docs

- Mission: [`dev_docs/_mission-booking-sibling-v1.md`](./dev_docs/_mission-booking-sibling-v1.md)
- API contract: [`dev_docs/api-contract-v0.md`](./dev_docs/api-contract-v0.md)
- Intent → commands: [`dev_docs/booking-command-library.md`](./dev_docs/booking-command-library.md)
- Supabase setup: [`dev_docs/supabase-setup.md`](./dev_docs/supabase-setup.md)

## Deploy

- Production: https://chatiq-booking.vercel.app/
- Health: https://chatiq-booking.vercel.app/api/health

## ChatIQ adapter (chat path wired)

Pilot is live: ChatIQ points at the deployed sibling with one allowlisted bot, and create/lookup/cancel/reschedule are chat-smoked. **Design locked (2026-10-21): LLM concierge drives the deterministic sibling via typed commands** — see [`dev_docs/booking-command-library.md`](./dev_docs/booking-command-library.md). Next steps: [`dev_docs/_mission-booking-sibling-v1.md`](./dev_docs/_mission-booking-sibling-v1.md) (**Resume here**).

In `chatiq` `.env.local` (or Vercel):

```bash
BOOKING_RUNTIME=sibling
BOOKING_SIBLING_URL=https://chatiq-booking.vercel.app
# Local sibling instead: BOOKING_SIBLING_URL=http://localhost:3003
BOOKING_SIBLING_TOKEN=<same as BOOKING_SERVICE_TOKEN on this app>
# Strongly recommended: only the pilot bot UUID
BOOKING_SIBLING_BOT_IDS=<pilot-bot-uuid>
```

Pilot bot: set **Booking** to `full` in bot settings. Restart `chatiq` after env changes.

Any non-welcome message to that bot calls the sibling; legacy booking engine is skipped for that bot. If the sibling errors/times out, ChatIQ fails closed to core chat (no legacy fallback).

## Persistence

Supabase client is wired. Apply the migration once (see [`dev_docs/supabase-setup.md`](./dev_docs/supabase-setup.md)); until then turns **fall back to mock** and `/api/health` reports `supabase.reachable: false`.
