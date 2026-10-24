# Booking design: LLM concierge → deterministic command library

Last updated: 2026-10-21
Status: **LOCKED design** (supersedes the heuristic-first WS-E v0 direction)
Owner: Engineering
Mission: [`_mission-booking-sibling-v1.md`](./_mission-booking-sibling-v1.md)

## 1) The decision (locked 2026-10-21)

**The LLM interprets; the deterministic sibling executes. The customer never touches the deterministic system directly.**

```text
Customer (any language, any channel)
        │  natural language
        ▼
ChatIQ LLM — "concierge"
  · discerns intent (book / check / cancel / reschedule / question)
  · runs the narrowing conversation (service → week → day → time of day)
  · replies in the customer's language
        │  ONE fixed set of typed commands (English IDs, ISO dates, enums)
        ▼
chatiq-booking sibling — "ledger"
  · deterministic only; never parses natural language
  · validates everything (slot free, booking exists, time in future)
  · returns structured facts, never prose for the customer
        │  structured result
        ▼
LLM renders the reply in the customer's language
```

Why: deterministic keyword/regex intent per language does not scale (v0 heuristics are English-only; Thai does not segment on `\b`). One language-agnostic command set operated by a multilingual LLM replaces per-language phrase tables. This was validated in discussion 2026-10-21 after the English-only deterministic pilot (create/lookup/cancel/reschedule all chat-smoked successfully in English).

### Principles

1. **One command set** is the only interface to booking state. Customers, the customer-facing LLM, admins, and admin tools all use it.
2. **Intent is semantic, not linguistic.** `booking.get_availability(service, date_from, date_to, time_of_day)` means the same thing whether the customer asked in English, Thai, or Chinese.
3. **The sibling is the source of truth.** The LLM never invents services, slots, prices, or booking state, and never writes to the database except through commands.
4. **Procedure lives in tools + a short policy prompt — not in a fetched guide/RAG doc.** RAG/guide content is for *facts* (services, prices, policies, FAQ), never for step-by-step procedure.
5. **Fail safe.** Unknown/low-confidence intent → ask a clarifying question. Sibling error/timeout → no booking action (fail closed, as today).

## 2) Command catalog (the tool set)

Internal names stay English. Inputs/outputs are structured. `actor` is attached to every call (see §5).

### Customer-scope commands

| Command | Mutating | Inputs | Returns |
|---------|----------|--------|---------|
| `booking.list_services` | No | — | services (id, title, duration, category, …) |
| `booking.search_services` | No | query / category, limit | **Phase 3b.0** — top matches for large catalogs |
| `booking.get_existing` | No | contact | next upcoming booking or none |
| `booking.get_availability` | No | service, date_from, date_to, time_of_day?, limit ≤ 5 | matching open slots (ISO + tz); **3b.0+** honors owner hours/blocks |
| `booking.create` | Yes | service, starts_at (from a returned slot) | booking (id, status, starts_at) |
| `booking.cancel` | Yes | booking_id, confirmed=true | booking status |
| `booking.reschedule` | Yes | booking_id, new starts_at (from a returned slot) | old cancelled + new booking |
| `booking.faq` *(data, not a command)* | No | — | service/policy facts for the LLM to answer from |

### Admin-scope commands (Phase 3 / 3b.0, same bus)

`booking.admin_search` (by day/provider/service/customer/status), `booking.create_on_behalf`, plus the customer commands with admin scope.

**Catalog & hours (Phase 3b.0 — design locked):** `catalog.upsert_service`, `catalog.set_active`, `catalog.reorder`, `availability.set_hours`, `availability.set_exception`, `availability.block`, `availability.unblock`. Spec: [`service-catalog-and-availability.md`](./service-catalog-and-availability.md). Admin-only — never exposed to the customer concierge.

### What happened to the v0 commands

`booking.create / lookup / clarify / cancel / reschedule / faq` remain the conceptual catalog. Changes: `lookup` → `get_existing`; `clarify` is an LLM conversation behavior, not a sibling command; availability becomes an explicit queryable command instead of an implicit step.

## 3) Narrowing policy (how the LLM drives availability)

Goal: never dump dozens of slots; never interrogate either.

1. Collect only what's missing, **skipping anything already stated**: service → which week → which day → morning/afternoon/evening.
2. The LLM is given **today's date, timezone, and booking horizon** in context, so "next Friday" / "next month" resolve before calling. The sibling validates the ISO window regardless.
3. Search a **~7-day window** per `get_availability` call; offer the **closest ≤ 3–5 slots**.
4. Offer "more / another day" by re-querying the next window — pagination is a new command call, not a longer list.
5. Ideal shape:
   - C: "I want to book" → AI: "What service would you like?"
   - C: "Teeth cleaning" → AI: "This week or next?" … C: "Friday morning please"
   - AI calls `get_availability(teeth-cleaning, <Fri window>, morning)` → offers 3 slots → customer picks → `booking.create` → confirmation in customer's language.

## 4) Guardrails (sibling-enforced, not prompt-only)

- `booking.create` / `reschedule` only accept a `starts_at` that is **currently open and in the future**; slot uniqueness enforced in DB (already live).
- `get_existing` (and therefore lookup/cancel/reschedule) only sees bookings with `starts_at >= now` (bug fixed 2026-10-21).
- Cancel/reschedule require an explicit customer confirmation in conversation before the LLM may call with `confirmed=true`; the sibling rejects unconfirmed mutations.
- Every mutating call is idempotent-safe against double-submit (existing slot-conflict handling) and will be audit-logged with actor + before/after (Phase 3).

## 5) Three interfaces, one bus

| Interface | User | Confirmation UX |
|-----------|------|-----------------|
| **Customer concierge** (ChatIQ LLM) | Customers, any language | Conversational ("Shall I cancel…?" → yes) |
| **Admin console** (booking `/admin` UI) | Human agents / providers | Direct: calendar/table, detail drawer with command buttons, ⌘K command palette, commands reference page |
| **Admin copilot** (LLM in admin console) | Human agents | **Confirm cards**: LLM proposes a command (e.g. reschedule + notify customer); a human clicks Confirm/Edit/Dismiss. Never mutates silently. |

Actor context on every command: `actor_type` (customer/agent/provider/admin), `actor_id`, `team_id`, scope. Customers: own contact only. Providers: own calendar. Agents: team-wide. If the LLM layer is down, the admin console still runs the business deterministically — the console is the fallback and the audit surface.

## 6) Identity & account linking (Phase 3a)

Full spec: [`identity-and-account-linking.md`](./identity-and-account-linking.md). Summary:

- Every channel account (web login, LINE user ID) is a legitimate first-class account; bookings belong to the **customer**, channel accounts are keys in `identity_bindings`.
- A customer at the "wrong" door is linked, never matched by claimed attributes: **merge only on proof of control of both accounts** — `booking.create_connect_token` (hashed, one-time, 10-min) → fresh login + consent screen at the other door → `booking.redeem_connect_token` runs the internal, deterministic `booking.merge_contacts` (fixed survivor rule, tombstone, audit) → notification to both channels.
- `booking.get_customer` exposes a customer's channel accounts to themselves and to staff.
- Staff: `booking.admin_list_identity_audit` / `booking.admin_unmerge` (from merge audit snapshot; `/admin/customers`).
- The concierge may offer and guide the ceremony with zero existence disclosure pre-merge; it never executes `merge_contacts` directly.

## 6b) Service catalog & availability (Phase 3b.0)

Full spec: [`service-catalog-and-availability.md`](./service-catalog-and-availability.md). Summary:

- Owner-configured, **business-agnostic** catalog (1–100+ services) + weekly hours / exceptions / blocks; shared calendar per bot in v1 (no staff matrix yet).
- Customer path unchanged at the command level; large catalogs use `search_services` instead of dumping titles into the prompt.
- Implement **after** Phase 3a leftovers; design is locked, schema/UI not started.

## 6c) Base + shape modules

Full spec: [`base-and-shape-modules.md`](./base-and-shape-modules.md). Summary:

- One sibling app: **base** + per-bot **shapes** (`appointments` default, then `resources`, then `stays`). Not separate apps per industry.
- Keep stable verbs (`list_services`, `get_availability`, `create`, …); modules extend slots/strategies.
- No runtime module loader required for 3b.0; contract exists so clinic/hotel can land later without a rewrite.

## 7) Contract evolution

- **v0 (today, pilot):** `POST /api/v1/turns/handle` — ChatIQ sends raw `message_text` + optional pre-selected `command`; sibling classifies (English heuristics) and returns English `reply_text`. Proven in pilot; now frozen as fallback/API-smoke path.
- **v1 (Phase 1–2):** `POST /api/v1/commands/execute` — `{ command, slots, actor, identity_claims, timezone }` → structured `{ ok, data }`, no prose. **Landed in Phase 1** (see `api-contract-v0.md`); the ChatIQ LLM tool loop (Phase 2) will call this. Heuristic classifiers (both repos) demote to: canned/button shortcuts + session continuation (`1/2/3`, confirm steps) + v0 fallback. They are **not** extended to new languages.

## 8) Explicit non-goals (v1)

- Sibling-side natural-language parsing, per-language regex/phrase tables.
- Payments, external calendar sync, waitlists, multi-provider optimization / staff-room assignment (post–3b.0).
- Admin copilot executing mutations without a human confirm click.

## 9) Roadmap

Phases and exit criteria live in the mission DoD:
[`_mission-booking-sibling-v1.md`](./_mission-booking-sibling-v1.md) §2–§3.
