# Base app + shape modules (connectability)

Last updated: 2026-10-26  
Status: **Design locked.** Base + `appointments` shipped. **`resources` v1 shipped** (shapes config, eligibility, any/specific, one resource per booking). **Next shape: `stays`.** Multi-resource linking (staff + room together) deferred.  
Mission: [`_mission-booking-sibling-v1.md`](./_mission-booking-sibling-v1.md)  
Related: [`service-catalog-and-availability.md`](./service-catalog-and-availability.md) · [`booking-command-library.md`](./booking-command-library.md) · [`identity-and-account-linking.md`](./identity-and-account-linking.md)

## 1) Verdict

**One booking sibling app** for all ChatIQ subscribers. Not a separate app per industry.

**Architecture:** a durable **base** + optional **shape modules** enabled per bot.  
**Today:** we already have most of the base (command bus, identity, catalog seed, appointments-shaped availability). We did **not** yet have an explicit module contract — this doc locks that so Phase 3b.0 does not paint us into “appointments-only forever.”

**No fundamental rewrite of shipped code.** Identity, ChatIQ adapter, and `commands/execute` stay. Connectability is **additive** (config + optional columns + registered commands/strategies).

## 2) Why this exists

| Subscriber example | Wrong model | Right model |
|--------------------|-------------|-------------|
| Clinic: 5 services, 3 clinicians | 15 “services” | 5 services + **resources** module + “any / specific” preference |
| Hotel: 30 rooms | 30 appointment services | **stays / inventory** module (nights, room types or units) |
| Solo consultant | 1–N services, one calendar | **appointments** only (base default) |

Industry language lives in **data** and **which modules are enabled**, not in forked apps.

## 3) Layers

```text
┌─────────────────────────────────────────────────────────┐
│ ChatIQ (thin) — booking_mode, concierge tools, claims     │
└──────────────────────────┬──────────────────────────────┘
                           │ commands/execute
┌──────────────────────────▼──────────────────────────────┐
│ BASE — always on                                          │
│  identity, contacts, command bus, audit hooks,            │
│  admin shell, bot settings, catalog primitives, hours     │
└──────────────────────────┬──────────────────────────────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐
    │appointments│  │ resources  │  │   stays    │
    │ (default)  │  │ (staff…)   │  │ (hotel…)   │
    └────────────┘  └────────────┘  └────────────┘
         shape modules (enable per bot)
```

### 3.1 Base (always present)

Owns:

- Team/bot scoping, auth token, `POST /api/v1/commands/execute`
- Contacts + identity bindings + connect tokens + merge (Phase 3a)
- Catalog **storage** (`catalog_items`) and hours/blocks tables (Phase 3b.0)
- Admin shell routes; actor types; audit log surface
- Stable customer-facing **verbs** (see §5) even when modules add optional slots

Does **not** own industry-specific scheduling math beyond a default appointments strategy.

### 3.2 Shape modules (optional, per bot)

Each module may register:

| Hook | Purpose |
|------|---------|
| Extra tables / columns | e.g. `resources`, `service_resources`, `ends_at` on bookings |
| Commands | admin + customer (namespaced or `booking.*` with module gate) |
| Availability strategy | How `get_availability` computes open intervals |
| Concierge tools + prompt rules | Which tools ChatIQ exposes; narrowing hints |
| Admin UI sections | Pages/panels under `/admin` |

**Default enabled module:** `appointments` (what Phase 3b.0 implements).

**Planned modules (order):**

1. **`appointments`** — duration slots, shared calendar, catalog + hours (3b.0).  
2. **`resources`** — people/rooms; eligibility matrix; customer preference `any` vs `resource_id` (clinic clinicians).  
3. **`stays`** — night ranges / inventory units or room types (hotel). Later; different availability semantics.

Modules compose: clinic = `appointments` + `resources`. Simple shop = `appointments` only. Hotel may be `stays` (+ optional `appointments` for spa later).

## 4) Per-bot enablement

Store on bot booking settings (table or JSON config — pick at 3b.0 impl):

```json
{
  "timezone": "Asia/Bangkok",
  "shapes": ["appointments"]
}
```

Later examples:

```json
{ "shapes": ["appointments", "resources"] }
{ "shapes": ["stays"] }
```

Rules:

- Unknown shape id → ignore / fail closed in admin, never crash chat.  
- Customer commands for a disabled shape → structured error `SHAPE_DISABLED`.  
- ChatIQ concierge tool list filtered by enabled shapes (sibling can expose `booking.get_bot_capabilities` later; until then ChatIQ may assume appointments-only for allowlisted pilots).

## 5) Stable command surface (connectability rule)

**Keep these verbs** across modules; extend **slots/payloads**, don’t fork apps:

| Command | Base meaning | Module extensions |
|---------|--------------|-------------------|
| `booking.list_services` / `search_services` | What can be booked | Resources may annotate “who can deliver” |
| `booking.get_availability` | Open options in a window | Appointments: slot starts; resources: optional `resource_id` / `resource_preference=any`; stays: night ranges |
| `booking.create` | Reserve | Optional `resource_id`, `ends_at` (stays), `capacity` |
| `booking.get_existing` / `cancel` / `reschedule` | Lifecycle | Same; reschedule rules may differ by shape |
| Identity commands | Unchanged | Shape-agnostic |

Availability **strategy** is selected by enabled shapes (appointments engine today; resources wraps it; stays replaces interval model).

## 6) Forward-compatible data (additive only)

When implementing 3b.0 / later modules, prefer **nullable additive columns** over breaking renames:

| Area | Forward-compatible choice |
|------|---------------------------|
| `bookings` | Keep `starts_at`; add nullable `ends_at` (stays / explicit end); nullable `resource_id` |
| Slot uniqueness | Today: unique open slot per bot+start. Resources: uniqueness becomes (bot, start, resource) or capacity-aware; design migration when `resources` lands — do not assume forever “one booking per start for whole bot” without capacity |
| `catalog_items` | Service = “what”; never encode clinician as a fake service |
| Hours | Bot-level hours in base; resource-level hours only inside `resources` module |

**3b.0 constraint:** implement shared-calendar appointments with `capacity` on the service, but **document** that bot-wide unique `(bot_id, starts_at)` may need relaxing when resources ship. Prefer capacity counting over a hard unique index that blocks multi-resource, or scope uniqueness knowing it will evolve.

## 7) Code organization (when we implement loaders)

Target layout (not required before 3b.0; migrate toward it):

```text
src/lib/
  base/           # execute router, identity, settings
  shapes/
    appointments/ # default availability + create rules
    resources/    # later
    stays/        # later
```

Until a loader exists: keep code where it is; **do not** invent a plugin runtime for 3b.0. The contract above is enough so the first real module (`resources`) can land without a rewrite.

## 8) What we will not do

- Separate Vercel apps per industry  
- Encode staff/rooms as catalog services  
- Put module business logic in ChatIQ  
- Build `stays` or `resources` before appointments catalog/hours work for real owners  
- Big-bang rewrite of Phase 3a identity

## 9) Implementation order (unchanged product sequence)

1. Finish Phase 3a leftovers (web→LINE, notifications, enrichment).  
2. Phase 3b.0 — catalog + hours as the **appointments** shape (this modules doc constrains uniqueness/capacity choices).  
3. Phase 3b admin console (calendar, audit, unmerge).  
4. **`resources` module** — clinic “any / specific clinician.”  
5. **`stays` module** — hotel inventory when a real customer needs it.

## 10) Success criteria for this design

- Clinic and hotel are conceivable **without** a second app.  
- 3b.0 can ship for solo / single-calendar businesses without waiting on resources.  
- Adding `resources` does not require renaming customer commands or splitting the sibling.  
- Agents reading Resume see: base locked, modules named, impl order clear.
