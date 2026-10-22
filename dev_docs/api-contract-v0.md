# Booking API contract v0

Service-to-service JSON over HTTPS. Auth: `Authorization: Bearer <shared token>`.

Product direction (locked 2026-10-21): **LLM interprets → typed booking commands → deterministic sibling**. See [`booking-command-library.md`](./booking-command-library.md).

> **Status:** this v0 turn contract is the live pilot contract and stays as fallback/API-smoke path. Phase 1 has added `POST /api/v1/commands/execute` (below) for the ChatIQ LLM tool loop.

## `GET /api/health`

```json
{
  "ok": true,
  "service": "chatiq-booking",
  "contract_version": "0",
  "persistence": "supabase",
  "timezone_default": "Asia/Bangkok",
  "supabase": { "configured": true, "reachable": true }
}
```

`persistence`: `mock` | `supabase`.

## `POST /api/v1/turns/handle`

### Request

```json
{
  "contract_version": "0",
  "team_id": "uuid",
  "bot_id": "uuid",
  "conversation_id": "uuid-or-null",
  "channel": "web|line|…",
  "message_text": "I want to book",
  "locale": "en",
  "timezone": "Asia/Bangkok",
  "session_id": null,
  "identity_claims": [
    { "provider": "chatiq_conversation", "external_id": "…", "verified": false }
  ],
  "command": "booking.create",
  "slots": {},
  "confidence": 0.9
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `team_id`, `bot_id` | yes | |
| `message_text` | usually | Slot picks (`1`/`2`/`3`) and free text |
| `command` | no | Closed catalog; if omitted, sibling may classify |
| `slots` | no | Future structured args |
| `confidence` | no | 0–1 hint from ChatIQ |

**Commands:** `booking.create` | `booking.lookup` | `booking.clarify` | `booking.cancel` | `booking.reschedule` | `booking.faq`

### Success

```json
{
  "contract_version": "0",
  "ok": true,
  "reply_text": "…",
  "surface_decision": "in_channel",
  "session_id": "uuid",
  "contact_id": "uuid",
  "ui": { "command": "booking.create", "slots": [] },
  "mock": false
}
```

`surface_decision`: `in_channel` | `handoff_required`.

### Failure

```json
{
  "contract_version": "0",
  "ok": false,
  "error": "…",
  "code": "UNAUTHORIZED|INVALID_REQUEST|…"
}
```

ChatIQ adapter: timeout / non-2xx / `ok: false` → fail closed (core chat continues).

## `POST /api/v1/commands/execute` (Phase 1 — structured commands)

Deterministic in/out, **no customer prose, no natural-language parsing**. Auth: same Bearer token. The caller (ChatIQ LLM tool loop, admin UI, smoke script) renders language.

### Request

```json
{
  "contract_version": "0",
  "team_id": "uuid",
  "bot_id": "uuid",
  "command": "booking.get_availability",
  "slots": {
    "service_slug": "consultation",
    "date_from": "2026-10-26",
    "date_to": "2026-10-30",
    "time_of_day": "morning",
    "limit": 3
  },
  "actor": { "type": "customer" },
  "identity_claims": [
    { "provider": "chatiq_conversation", "external_id": "…", "verified": false }
  ],
  "conversation_id": null,
  "timezone": "Asia/Bangkok"
}
```

| Command | Key `slots` | Notes |
|---------|-------------|-------|
| `booking.list_services` | — | no identity needed |
| `booking.get_availability` | `service_id`/`service_slug`, `date_from`, `date_to`, `time_of_day` (`morning`/`afternoon`/`evening`/`any`), `limit` ≤ 5 | future, untaken slots only; empty array is success |
| `booking.get_existing` | `contact_id` or identity | next upcoming booking or `booking: null` |
| `booking.create` | `starts_at` (ISO, from availability), service | `SLOT_IN_PAST` / `SLOT_TAKEN` on invalid slot |
| `booking.cancel` | `booking_id` (or identity's next booking), `confirmed: true` | `CONFIRMATION_REQUIRED` without `confirmed` |
| `booking.reschedule` | `booking_id`, `new_starts_at`, `confirmed: true` | creates new booking **before** cancelling the old one |
| `booking.create_connect_token` | — (identity required) | Phase 3a: returns `{ token, short_code, expires_at, connect_url }`; hashed, one-time, 10-min |
| `booking.redeem_connect_token` | `code` (long token or 6-digit short code) | runs deterministic merge; errors `TOKEN_INVALID` / `TOKEN_USED` / `TOKEN_EXPIRED` / `MERGE_CONFLICT` |
| `booking.get_customer` | — (identity required) | contact + channel bindings + upcoming bookings (follows merges to survivor) |

Identity model & linking ceremony: [`identity-and-account-linking.md`](./identity-and-account-linking.md). Requires migration `20261023000000_identity_linking.sql`.

Identity: provide `slots.contact_id`, or `identity_claims` / `conversation_id` (resolved to a booking contact). Customer actors can only act on their own bookings; staff actors (`agent`/`admin`/`provider`) may act team-wide (Phase 3 UI).

### Success / failure

```json
{ "contract_version": "0", "ok": true, "command": "booking.get_availability", "data": { "service": {}, "slots": [], "timezone": "Asia/Bangkok" } }
{ "contract_version": "0", "ok": false, "command": "booking.create", "error": "…", "code": "SLOT_TAKEN" }
```

HTTP status: 200 ok · 400 invalid/unknown/confirmation · 404 booking/contact · 409 slot/past/state conflicts · 401 unauthorized.

**Exit test (no LLM):** `npm run smoke:commands` (local server on :3003 or `BOOKING_SMOKE_BASE_URL`) — 20 checks covering the whole lifecycle. See `scripts/smoke-commands.mjs`.

## Admin

`GET /api/v1/admin/bookings` — Bearer token; returns recent bookings for schedule UI (`/admin`).
