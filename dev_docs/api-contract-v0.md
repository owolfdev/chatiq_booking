# Booking API contract v0

Service-to-service JSON over HTTPS. Auth: `Authorization: Bearer <shared token>`.

Product direction (locked 2026-10-21): **LLM interprets → typed booking commands → deterministic sibling**. See [`booking-command-library.md`](./booking-command-library.md).

> **Status:** this v0 turn contract is the live pilot contract and stays as fallback/API-smoke path. Phase 1 adds `POST /api/v1/commands/execute` (structured data in/out, no customer prose) for the ChatIQ LLM tool loop — update this doc when it lands.

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

## Admin

`GET /api/v1/admin/bookings` — Bearer token; returns recent bookings for schedule UI (`/admin`).
