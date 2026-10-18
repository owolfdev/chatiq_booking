# Booking command library (intent → typed actions)

Last updated: 2026-10-18  
Status: **Spec / roadmap** — not implemented yet  
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

Canned keyword matching cannot reliably choose among these. Relying on it as the primary entry to booking is brittle (especially multilingual).

## Decision

**Prefer inferred intent + a closed library of booking commands** over keyword-first ownership.

1. **Understand speech act** (create / lookup / change / cancel / FAQ / clarify).
2. **Select a typed command** from a fixed catalog (tool-style; not freeform LLM side effects).
3. **Execute** only through gated paths (`booking_mode`, sibling allowlist); sibling owns booking effects.
4. Keep **keywords / LINE buttons** as optional **shortcuts that map to the same commands** — not a parallel system.

Core chat stays default; booking owns a turn only when a command is selected (or an active booking session continues).

## v0 command catalog (draft)

Stable names; schemas evolve with the API contract.

| Command | Speech act | Mutating? | Notes |
|---------|------------|-----------|--------|
| `booking.create` | Start / continue new booking | Yes (when committed) | Pilot happy-path |
| `booking.lookup` | Check existing booking / time | No | Needs identity binding |
| `booking.reschedule` | Change time/slot | Yes | After lookup |
| `booking.cancel` | Cancel | Yes | Confirm required |
| `booking.faq` | Policy / how-to about booking | No | May stay in RAG/core; or sibling FAQ |
| `booking.clarify` | Ambiguous intent | No | Ask: new vs existing? |

**Rules**
- Unknown / low confidence → **do not** invent a command; stay in core chat or emit `booking.clarify`.
- Mutating commands require **confirm** (or explicit button) before commit when confidence is mid.
- Commands have **slot schemas**; missing slots → one clarifying question, no guessing.
- Explicit UI (buttons, exact canned with `booking_start`-style actions) maps to the same command IDs.

## Where it lives

| Concern | Owner |
|---------|--------|
| Intent → command selection | ChatIQ (thin router / tool-call), or sibling if turn API accepts `message_text` only and resolves internally — **prefer ChatIQ selects, sibling executes** for isolation |
| Command execution + session state | `chatiq-booking` |
| Keyword canned | Optional shortcuts → same command IDs |
| Gates | `booking_mode`, `BOOKING_RUNTIME=sibling`, `BOOKING_SIBLING_BOT_IDS` |

Contract evolution: extend `POST /api/v1/turns/handle` (or a dedicated `POST /api/v1/commands/execute`) with optional `command` + `slots` once pilot stub smoke is done. Until then, stub may treat all messages as soft create/clarify. See [`api-contract-v0.md`](./api-contract-v0.md).

## Roadmap placement

1. **Now** — Pilot env + stub smoke (no command library required).
2. **Next (DoD vertical slice)** — Wire Supabase; implement `booking.create` end-to-end.
3. **Then** — Add lookup / clarify; wire ChatIQ intent→command selection; demote keyword canned to shortcuts.
4. **Later** — reschedule / cancel; widen allowlist for release.

Tracked on mission [`_mission-booking-sibling-v1.md`](./_mission-booking-sibling-v1.md) (WS-E) and workspace [`ROADMAP.md`](../../ROADMAP.md).
