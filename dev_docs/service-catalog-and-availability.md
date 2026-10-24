# Service catalog & availability (owner-configured, business-agnostic)

Last updated: 2026-10-25  
Status: **Design locked; schema + admin commands ✅ (2026-10-25).** Admin Services/Hours UI next. Phase 3a complete.  
Mission: [`_mission-booking-sibling-v1.md`](./_mission-booking-sibling-v1.md) (Resume here, Phase 3b.0)  
Design context: [`booking-command-library.md`](./booking-command-library.md)

## 1) Why

Pilot booking works with a single auto-seeded `catalog_items` row (“Consultation”) and hard-coded slot generation. Real businesses need **1–100+ services** they configure themselves, without code changes and without teaching the LLM per-industry procedures.

This doc locks a **domain-agnostic** model: clinic, salon, consultancy, tutoring, and classes all use the same tables and commands. Industry language lives in **data** (titles, descriptions, categories), not in sibling logic.

## 2) Current status (honest)

| Piece | Status |
|-------|--------|
| `catalog_items` (+ duration, buffers, capacity, category, …) | ✅ Migration `20261025000001_catalog_and_hours.sql` |
| `bot_booking_settings` / `availability_hours` / exceptions / blocks | ✅ |
| `booking.list_services` / `search_services` / `get_availability` / `create` | ✅ Hours-aware availability; capacity-aware conflicts |
| Empty catalog → silent seed “Consultation” | ✅ Only when catalog empty |
| Empty hours → seed Mon–Fri 09–17 once | ✅ `ensureDefaultHoursIfEmpty` |
| Owner CRUD commands (`catalog.*`, `availability.*`) | ✅ Admin/system actor; smoke `npm run smoke:catalog` PASS |
| Admin Services + Hours UI | ✅ `/admin/services`, `/admin/hours` (2026-10-25) |

## 3) Principles (locked)

1. **Services are data, not prompts.** Titles, durations, buffers, active flag, optional price display, optional description. The concierge only calls catalog/availability commands; it never invents services or slots.
2. **Same command bus for 1 or 100.** Customer flow stays: discover service → window → slots → create. Scale changes discovery UX, not the mutation path.
3. **One shared calendar per bot (v1).** Capacity defaults to 1 concurrent booking at a start time unless a service sets `capacity > 1`. No staff/rooms matrix in v1.
4. **Hours and exceptions are calendar rules**, not hard-coded timezone pilot logic. Bot timezone + weekly hours + date exceptions + opaque blocks drive slot search.
5. **Bot-scoped catalog.** Uniqueness remains `(team_id, bot_id, slug)`. One ChatIQ bot = one bookable business face.
6. **Fail closed.** Inactive services are invisible to customers. Empty or closed hours → empty slots (success), never invented openings. Create only against open slots for that service’s duration (+ buffers).
7. **ChatIQ stays thin.** Catalog and hours live in `chatiq-booking` admin + command bus; core chat does not store business catalog.

## 4) Product shape (v1)

```text
Owner (booking /admin)
  → catalog.* + availability.* commands
  → catalog_items + hours/exceptions/blocks

Customer (ChatIQ concierge)
  → list_services | search_services → get_availability → create
  → never writes catalog; never invents slots
```

**Multi-resource (staff/rooms)** and **hotel stays** are **shape modules**, not fake catalog rows. See [`base-and-shape-modules.md`](./base-and-shape-modules.md). This 3b.0 doc is the **`appointments`** shape only (shared calendar v1). Do not encode clinicians or rooms as services.

## 5) Data model (extend, don’t replace)

### 5.1 `catalog_items` — additive columns

Keep existing columns. Add:

| Column | Type | Notes |
|--------|------|--------|
| `description` | text null | Short; FAQ / concierge context |
| `category` | text null | Grouping label (free text or stable slug) |
| `sort_order` | int not null default 0 | Stable admin + list order |
| `buffer_before_minutes` | int not null default 0 | Blocks adjacent starts |
| `buffer_after_minutes` | int not null default 0 | |
| `capacity` | int not null default 1 | Concurrent bookings at same `starts_at` |
| `price_cents` | int null | Display only until payments |
| `currency` | text null | e.g. `THB`, `USD` |
| `booking_horizon_days` | int null | Override bot default when set |
| `min_notice_minutes` | int null | Override bot default when set |
| `updated_at` | timestamptz | |

Archive = `active=false`. Do not hard-delete rows that future/past bookings reference.

### 5.2 Hours layer (new tables)

All scoped `(team_id, bot_id)`.

**`availability_hours`** — weekly template  
- `weekday` 0–6 (or Mon=1…Sun=7; pick one in migration and stick to it)  
- `start_local` / `end_local` (time without tz; interpreted in bot timezone)  
- Multiple rows per weekday allowed (split shifts)

**`availability_exceptions`** — per calendar date  
- `on_date` (date)  
- `closed` boolean, or special `start_local` / `end_local` when open outside template  
- Optional note

**`availability_blocks`** — opaque intervals  
- `starts_at` / `ends_at` timestamptz  
- `reason` text null (lunch, holiday, private event)

### 5.3 Bot-level defaults (config row or env→DB later)

- `timezone` (pilot: Asia/Bangkok)  
- Default `booking_horizon_days`, `min_notice_minutes`, slot step (e.g. 15/30 min)

Until a `bot_booking_settings` table exists, defaults may live in sibling config keyed by `bot_id`; migration should prefer a settings table so admin UI can edit them.

### 5.4 Slot search (deterministic)

```text
candidates = starts on grid within [date_from, date_to]
  ∩ weekly hours (or exception open window)
  − exception closed days
  − availability_blocks
  − taken bookings (count >= service.capacity at start, respecting buffers)
  ∩ starts_at >= now + min_notice
  ∩ within booking_horizon
return ≤ 5 closest (existing limit contract)
```

Empty array is success. Create still validates the chosen `starts_at` server-side.

## 6) Commands (same bus)

### Customer / concierge

| Command | Role |
|---------|------|
| `booking.list_services` | Active services; include `category`, `sort_order`, `duration_minutes`; optional `group_by=category` |
| `booking.search_services` | **New.** Keyword / category filter; return top N candidates (for catalogs ≫ 8) |
| `booking.get_availability` | Unchanged contract; implementation must honor hours + service duration/buffers |
| `booking.create` / `cancel` / `reschedule` / `get_existing` | Unchanged |

### Admin-only (Phase 3b.0)

| Command | Role |
|---------|------|
| `catalog.upsert_service` | Create/update by id or slug; validates duration > 0, slug unique per bot |
| `catalog.set_active` | Soft archive / restore |
| `catalog.reorder` | Optional batch `sort_order` |
| `availability.set_hours` | Replace or patch weekly template |
| `availability.set_exception` | Upsert date exception |
| `availability.block` | Add opaque block |
| `availability.unblock` | Remove block by id |

Never expose catalog/hours mutations to the customer concierge. Admin console buttons and (later) copilot confirm-cards call these.

## 7) Admin UI (booking `/admin`)

Not a separate product. New sections:

1. **Services** — table CRUD; activate/deactivate; reorder; category; duration/buffers; optional price; no hard delete when referenced.  
2. **Hours** — weekly grid; exception dates; block list.  
3. Existing **calendar / bookings** remains Phase 3b proper (ops on appointments).

ChatIQ dashboard does **not** host catalog editors.

## 8) Concierge behavior at scale

| Active service count | Behavior |
|----------------------|----------|
| 1 | Skip “which service?” when unambiguous; still allow name confirmation |
| 2–8 | List titles (or short list from `list_services`); ask which |
| 9–100 | Ask category or keyword first → `search_services` → clarify top few → availability |

Rules:

- Never paste the full catalog into the system prompt.  
- Ambiguous match → sibling returns candidates; LLM asks; does not guess.  
- Inactive services never appear in customer tools.

## 9) Implementation order (after Phase 3a leftovers)

1. **Schema + admin commands + API smoke** (no LLM): CRUD services, hours, blocks; `get_availability` uses hours; seed “Consultation” only when catalog empty.  
2. **Admin UI** Services + Hours.  
3. **Concierge** `search_services` + prompt rules for large catalogs.  
4. **Later modules:** `resources` (any/specific clinician), then `stays` (hotel) — [`base-and-shape-modules.md`](./base-and-shape-modules.md). Capacity > 1 proven in smoke; payments on `price_cents`.

**Uniqueness note for implementers:** today’s pilot may use a bot-wide open-slot unique index. When implementing 3b.0, prefer **capacity-aware** conflict checks (and/or document that uniqueness will become resource-scoped) so the `resources` module is not blocked by a permanent “one booking per start for the whole bot” constraint.

## 10) Explicit non-goals (v1 catalog)

- Staff/room assignment, multi-location inventory  
- Packages / memberships / deposits / payment capture  
- External Google/Outlook sync, waitlists  
- Per-language title tables in the sibling (LLM answers in the customer’s language from structured fields)  
- Multi-provider optimization

## 11) Success criteria

- Owner configures 1 or 50 services without code changes.  
- Empty / closed hours → no inventable slots.  
- Pilot “Consultation” is a normal catalog row.  
- Customer LINE/web path unchanged at the command level.  
- Identity merge semantics untouched.

## 12) Relationship to other docs

| Doc | Role |
|-----|------|
| [`booking-command-library.md`](./booking-command-library.md) | Command bus + narrowing; admin `availability.*` already named |
| [`identity-and-account-linking.md`](./identity-and-account-linking.md) | Who the customer is; orthogonal to what they book |
| [`_mission-booking-sibling-v1.md`](./_mission-booking-sibling-v1.md) | Phase 3b.0 placement + Resume order |
