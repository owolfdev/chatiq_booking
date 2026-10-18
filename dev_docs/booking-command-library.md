# Booking command library (intent → typed actions)

Last updated: 2026-10-19  
Status: **Implementing** (WS-E)  
Owner: Engineering

## Problem

Keyword / canned triggers on words like “booking” or “appointment” are **ambiguous**. Same surface form, different speech acts:

| Customer says | Not the same as |
|---------------|-----------------|
| I want to make a booking | Create |
| Can you check if I already have a booking? | Lookup |
| When booking a service can I select my provider? | FAQ / policy |
| I’d like to schedule an appointment | Create |
| I already have an appointment — can I check the time? | Lookup |

## Decision

**Prefer inferred intent + a closed library of booking commands** over keyword-first ownership.

1. Understand speech act (create / lookup / change / cancel / FAQ / clarify).
2. Select a typed command from a fixed catalog.
3. Execute only through gated paths; sibling owns booking effects.
4. Keywords/buttons = shortcuts to the same command IDs.

## v0 command catalog

| Command | Speech act | Mutating? | Pilot status |
|---------|------------|-----------|--------------|
| `booking.create` | Start / continue new booking | Yes (on commit) | **Done** |
| `booking.lookup` | Check existing booking / time | No | **Done** |
| `booking.clarify` | Ambiguous intent | No | **Done** |
| `booking.cancel` | Cancel (yes/no confirm) | Yes | **Done** |
| `booking.reschedule` | Cancel current + offer new slots | Yes | **Done** |
| `booking.faq` | Policy / how-to | No | Pilot stub copy |

**Rules**
- Unknown / low confidence → `booking.clarify` or stay in core chat (ChatIQ gate).
- Active session in `awaiting_slot` / mid-create → continue `booking.create` (slot pick).
- Mutating commands: confirm when mid-confidence (later).

## Ownership

| Concern | Owner |
|---------|--------|
| Intent → command selection | Prefer **ChatIQ** (heuristic v0; LLM tool-call later) |
| Command execution + session | **`chatiq-booking`** |
| If `command` omitted on turn | Sibling runs same heuristic classifier (safe for API smoke) |

## Wire format

Optional on `POST /api/v1/turns/handle` (contract still `"0"`):

```json
{
  "command": "booking.create",
  "slots": {},
  "confidence": 0.9
}
```

See [`api-contract-v0.md`](./api-contract-v0.md).

## Canned shortcuts (ChatIQ)

- `action: booking_start` → `booking.create`
- `action_config.booking_command` → any catalog id (overrides)

## Roadmap

1. ~~Pilot create + admin + WS-E v0~~ **done**
2. Later — LLM tool selection; widen allowlist; archive legacy

Mission: [`_mission-booking-sibling-v1.md`](./_mission-booking-sibling-v1.md) WS-E.
