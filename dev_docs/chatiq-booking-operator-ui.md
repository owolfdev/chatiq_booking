# ChatIQ booking operator UI (product surface)

Last updated: 2026-10-26  
Status: **Design locked.** Implementation started (staff helper + schedule list/cancel).  
Mission: [`_mission-booking-sibling-v1.md`](./_mission-booking-sibling-v1.md) · Workspace: [`ROADMAP.md`](../../ROADMAP.md) §C

## 1) Verdict

**Subscribers configure booking and review appointments inside ChatIQ** (team dashboard, normal auth).

**`chatiq-booking` remains the engine** (Supabase, commands API, availability, identity, audit). ChatIQ must not reimplement booking business logic.

Sibling `/admin` stays as a temporary/ops console until ChatIQ parity; then demote to internal-only (or remove from subscriber docs).

## 2) Why

- Operators already live in ChatIQ (`/dashboard/…`).
- Sibling `/admin` uses a pasted service token — fine for pilots, wrong for GTM.
- Legacy `/dashboard/bookings/` is the **old in-process engine** and must not be extended for the sibling.

## 3) Product surfaces in ChatIQ (per bot)

| Surface | Purpose |
|---------|---------|
| **Booking settings** | Enable booking mode; shapes (`appointments` / `resources` / `stays`); services; hours; resources + eligibility + person+room; stays notes |
| **Schedule** | See customer bookings; cancel / reschedule / no-show / create-on-behalf |
| **Customers / audit** (later) | Linked identities; who changed what |

Suggested routes (names flexible at impl):

```text
/dashboard/bots/[botId]/booking          → schedule (default)
/dashboard/bots/[botId]/booking/settings → shapes + catalog + hours + resources/stays
```

Or under existing bot settings with a **Booking** tab. Prefer one clear entry from the bot, not a second global “Bookings” nav that points at legacy.

## 4) Architecture rules

1. ChatIQ UI → `POST` sibling `commands/execute` (same verbs as sibling `/admin`).
2. Auth: ChatIQ session + team membership; server-side use sibling service token (never expose token to the browser).
3. Scope every call with the selected `team_id` + `bot_id`.
4. No booking tables in ChatIQ Postgres for operator data — sibling DB is source of truth.
5. Concierge / customer chat path unchanged (already thin adapter).

## 5) Legacy `/dashboard/bookings/`

| Step | Action |
|------|--------|
| 1 | **Hide** from sidebar / header when sibling is the active runtime (or feature-flag) |
| 2 | Soft landing: page explains “Booking moved” + link to new bot booking UI once live |
| 3 | **Delete / archive** routes + legacy booking actions after ChatIQ operator UI ships and pilots don’t need the old flows |

Do **not** wire legacy UI to the sibling as a shortcut — replace it.

## 6) Implementation order (Track C)

1. ~~ChatIQ server helper: execute sibling command as staff actor for a bot the user can manage.~~ ✅ `src/lib/booking-sibling/staff.ts` + `POST /api/booking/staff/command` + `GET /api/booking/staff/bookings`  
2. ~~**Schedule** page (read + mutate via existing commands)~~ ✅ list + cancel / reschedule / no-show / create-on-behalf at `/dashboard/bots/[slug]/booking`.  
3. **Settings** page (shapes, services, hours, resources/stays — port sibling admin panels) — placeholder route only.  
4. Hide legacy `/dashboard/bookings` nav.  
5. Remove legacy booking dashboard code when safe.  
6. Demote sibling `/admin` to ops-only in docs.

## 7) Success criteria

- A team admin never needs `chatiq-booking.vercel.app/admin` for normal setup or schedule review.  
- Legacy bookings nav is gone or clearly archived.  
- Sibling remains the only place booking rules and persistence live.
