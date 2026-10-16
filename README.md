# chatiq-booking

Isolated booking sibling for ChatIQ. Core chat stays safe: ChatIQ calls this app over HTTPS only when a bot is gated on and the sibling runtime is enabled.

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

## ChatIQ adapter (chat path wired)

In `chatiq` `.env.local`:

```bash
BOOKING_RUNTIME=sibling
BOOKING_SIBLING_URL=http://localhost:3003
BOOKING_SIBLING_TOKEN=<same as BOOKING_SERVICE_TOKEN>
# Strongly recommended: only the pilot bot UUID
BOOKING_SIBLING_BOT_IDS=<pilot-bot-uuid>
```

Pilot bot: set **Booking** to `full` in bot settings. Restart `chatiq` after env changes.

Any non-welcome message to that bot calls the sibling; legacy booking engine is skipped for that bot. If the sibling errors/times out, ChatIQ fails closed to core chat (no legacy fallback).

## Persistence

Skeleton uses **in-memory mock** only. A dedicated Supabase project comes with the first real vertical slice.
