# Booking API contract v0

Service-to-service JSON over HTTPS. Auth: `Authorization: Bearer <shared token>`.

**Product direction (not fully in wire format yet):** entry should be **intent → typed booking commands**, not keyword canned as primary ownership. See [`booking-command-library.md`](./booking-command-library.md). v0 below is the stub turn handle; a later revision adds optional `command` + `slots`.

## `GET /api/health`

No auth required (liveness).

```json
{
  "ok": true,
  "service": "chatiq-booking",
  "contract_version": "0",
  "persistence": "mock",
  "timezone_default": "Asia/Bangkok"
}
```

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
  ]
}
```

### Success

```json
{
  "contract_version": "0",
  "ok": true,
  "reply_text": "…",
  "surface_decision": "in_channel",
  "session_id": "ses_mock_1",
  "contact_id": "ctc_mock_1",
  "ui": null,
  "mock": true
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

ChatIQ adapter: timeout / non-2xx / `ok: false` → fail closed (skip sibling; core chat continues).

## Forward: commands (planned)

Optional request fields (contract bump when implemented):

```json
{
  "command": "booking.create",
  "slots": { "service_id": null, "preferred_date": null },
  "confidence": 0.82
}
```

If `command` is omitted, sibling may infer or return clarify. Closed catalog: `booking.create` | `booking.lookup` | `booking.reschedule` | `booking.cancel` | `booking.faq` | `booking.clarify`.
