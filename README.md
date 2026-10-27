# chatiq-booking

Isolated booking **engine** for ChatIQ. Core chat stays safe: ChatIQ calls this app over HTTPS only when a bot is gated on and the sibling runtime is enabled.

**Operators:** configure schedule and settings in **ChatIQ** (`/dashboard/bots/[slug]/booking`). Sibling `/admin` is **ops/pilot only**. **What’s next:** [`ROADMAP.md`](./ROADMAP.md). Mission: [`dev_docs/_mission-booking-sibling-v1.md`](./dev_docs/_mission-booking-sibling-v1.md). Spec: [`dev_docs/chatiq-booking-operator-ui.md`](./dev_docs/chatiq-booking-operator-ui.md).

## Local

```bash
cp .env.example .env.local
npm install
npm run dev   # http://localhost:3003
```

- Health: `GET /api/health`
- Commands API: `POST /api/v1/commands/execute` with `Authorization: Bearer <BOOKING_SERVICE_TOKEN>`; the turn endpoint remains for deterministic fallback.

## Docs

- **What’s next:** [`ROADMAP.md`](./ROADMAP.md)
- Mission: [`dev_docs/_mission-booking-sibling-v1.md`](./dev_docs/_mission-booking-sibling-v1.md)
- API contract: [`dev_docs/api-contract-v0.md`](./dev_docs/api-contract-v0.md)
- Intent → commands: [`dev_docs/booking-command-library.md`](./dev_docs/booking-command-library.md)
- Supabase setup: [`dev_docs/supabase-setup.md`](./dev_docs/supabase-setup.md)

## Deploy

- Production: https://chatiq-booking.vercel.app/
- Health: https://chatiq-booking.vercel.app/api/health

## ChatIQ adapter (chat path wired)

Pilot foundation is live: ChatIQ points at the sibling for allowlisted bots; Track C operator UI is production-confirmed (2026-10-28). **Design locked (2026-10-21): LLM concierge drives the deterministic sibling via typed commands** — see [`dev_docs/booking-command-library.md`](./dev_docs/booking-command-library.md). Resume: [`ROADMAP.md`](./ROADMAP.md) · [`dev_docs/_mission-booking-sibling-v1.md`](./dev_docs/_mission-booking-sibling-v1.md).

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

Booking intent for an allowlisted `booking_mode=full` bot routes through the sibling; general chat stays on the normal bot path. If the sibling errors or times out, ChatIQ fails closed to core chat (no legacy fallback).

## Persistence

Supabase client is wired. Apply the migration once (see [`dev_docs/supabase-setup.md`](./dev_docs/supabase-setup.md)); until then turns **fall back to mock** and `/api/health` reports `supabase.reachable: false`.
