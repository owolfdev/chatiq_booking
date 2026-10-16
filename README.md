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

## ChatIQ adapter

In `chatiq`, set:

```bash
BOOKING_SIBLING_URL=http://localhost:3003
BOOKING_SIBLING_TOKEN=<same as BOOKING_SERVICE_TOKEN>
BOOKING_RUNTIME=sibling
```

`booking_mode` must be `full` on the bot. If the sibling is down or misconfigured, ChatIQ fails closed (no booking network call / falls back to core chat).

## Persistence

Skeleton uses **in-memory mock** only. A dedicated Supabase project comes with the first real vertical slice.
