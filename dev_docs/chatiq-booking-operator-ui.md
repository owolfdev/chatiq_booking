# ChatIQ booking operator UI (product surface)

Last updated: 2026-10-28  
Status: **~99% shipped; production ✅.** Schedule ✅ · Settings ✅ · Booking links ✅ · Legacy UI archived ✅ · Sibling `/admin` ops-only ✅. Optional: time blocks / customers-audit in ChatIQ.

Mission: [`_mission-booking-sibling-v1.md`](./_mission-booking-sibling-v1.md) · Roadmap: [`../ROADMAP.md`](../ROADMAP.md) · Workspace index: [`../../ROADMAP.md`](../../ROADMAP.md)

## 1) Verdict

**Subscribers configure booking and review appointments inside ChatIQ** (team dashboard, normal auth).

**`chatiq-booking` remains the engine** (Supabase, commands API, availability, identity, audit). ChatIQ must not reimplement booking business logic.

Sibling `/admin` is **ops/pilot only** (pasted service token). Subscribers use ChatIQ for normal setup and schedule. Optional leftover on `/admin`: time blocks, custom exception windows, customers/audit/copilot until those land in ChatIQ.

## 2) Why

- Operators already live in ChatIQ (`/dashboard/…`).
- Sibling `/admin` uses a pasted service token — fine for pilots, wrong for GTM.
- Legacy `/dashboard/bookings/` is the **old in-process engine** and must not be extended for the sibling.

## 3) How to open it (operators)

**Not** the booking mode dropdown in bot Settings (`off` / `intent_only` / `full`) — that only gates chat.

1. **My Bots** → click **Booking** on a bot card, or open the bot preview and click **Booking** next to Settings.
2. Bot Settings and the internal `/chat/[slug]` test page also link to **Booking**. These links appear when sibling booking is configured and that bot has `booking_mode=full`.
3. Or go directly:

```text
/dashboard/bots/[slug]/booking          → schedule (list + cancel / reschedule / no-show / create / hard-delete)
/dashboard/bots/[slug]/booking/settings → shapes, services, hours (+ closed dates), resources, eligibility / person+room
```

Requires `BOOKING_RUNTIME=sibling` + `BOOKING_SIBLING_URL` + `BOOKING_SIBLING_TOKEN` on that ChatIQ deploy. Set bot **booking_mode=full** when chat booking should be live.

The links use `booking_mode=full` as the discoverability gate. The direct operator URLs remain accessible to an authorized team member when sibling runtime is configured, so an owner can prepare catalog and hours before turning on chat booking.

Global sidebar **Bookings** is removed; `/dashboard/bookings/**` soft-lands to My Bots (legacy UI archived 2026-10-28).

## 4) Product surfaces in ChatIQ (per bot)

| Surface | Status | Purpose |
|---------|--------|---------|
| **Schedule** | ✅ | See customer bookings; filter by status/time, sort, cancel / reschedule / no-show / create-on-behalf / hard-delete (`booking.admin_delete`; prefer cancel for normal ops). Progress banner stays visible through refresh; Status, When, Sort, and create-form Service are saved per user/bot in browser storage. Row selection resets on revisit. |
| **Booking settings** | ✅ | Shapes, services, hours (+ closed dates), resources + eligibility + person+room |
| **booking_mode** (bot Settings form) | Separate | Chat gate only — not the operator catalog UI |
| **Customers / audit** | Later | Linked identities; who changed what (still sibling `/admin` for now) |

## 5) Architecture rules

1. ChatIQ UI → sibling `commands/execute` (and admin bookings list) via staff API routes.  
2. Auth: ChatIQ session + team membership; server-side service token (never in the browser).  
3. Scope every call with the selected `team_id` + `bot_id`.  
4. No booking tables in ChatIQ Postgres for operator data — sibling DB is source of truth.  
5. Concierge / customer chat path unchanged (thin adapter).

Staff helpers: `chatiq/src/lib/booking-sibling/staff.ts` · `POST /api/booking/staff/command` · `GET /api/booking/staff/bookings`.

## 6) Legacy `/dashboard/bookings/`

| Step | Status | Action |
|------|--------|--------|
| 1 | ✅ | Bookings removed from sidebar |
| 2 | ✅ | Soft landing on `/dashboard/bookings/**` → My Bots |
| 3 | ✅ | Legacy dashboard routes deleted (2026-10-28); catch-all soft landing only |

In-process booking **engine** leftovers in `chatiq` (actions/chat) are separate optional WS-D work — do not revive the global dashboard.

## 7) Implementation checklist (Track C)

1. ~~ChatIQ server helper~~ ✅ `staff.ts` + staff API routes  
2. ~~Schedule page~~ ✅ `/dashboard/bots/[slug]/booking`  
3. ~~Settings page~~ ✅ shapes, services, hours (+ closed dates), resources, eligibility / person+room  
4. ~~Hide legacy nav + soft landing~~ ✅  
5. ~~Archive legacy booking dashboard UI~~ ✅ 2026-10-28  
6. ~~Demote sibling `/admin` to ops-only in docs~~ ✅ (+ ops banner in AdminShell)

## 8) Success criteria

- [x] A team admin can set up catalog/hours/resources and manage the schedule in ChatIQ without pasting a sibling service token.  
- [x] Legacy Bookings nav removed; deep links soft-land.  
- [x] Sibling remains the only place booking rules and persistence live.  
- [x] Local pilot Supabase smoke confirms staff hard-delete removes a row and a second delete returns `BOOKING_NOT_FOUND` (2026-10-27).
- [x] Production booking confirmed by operator (2026-10-28).  
- [x] Legacy `/dashboard/bookings` UI deleted/archived (2026-10-28).  
- [ ] Optional: customers/audit + time blocks in ChatIQ (today: sibling `/admin`).

## 9) Release check for October 27 changes

Pushed commits: `chatiq-booking` `7b68459` (hard-delete verification), `chatiq` `f40ede42` (schedule feedback/preferences) and `62ea7790` (Booking links). Local `smoke:commands` and typechecks passed. Confirm the deployed revisions first; a push alone does not prove a deployment finished.

On a pilot bot, delete a disposable open booking, a disposable cancelled booking, and two selected bookings. Refresh and confirm all deleted IDs are absent from the sibling Supabase `bookings` table. Check the progress banner during actions and failure messages if a request fails. Reload to confirm Status, When, Sort, and Service choices restore for that user/bot, while row checkboxes reset; another bot should keep separate choices. Finally verify the four Booking entry points on a full bot and their absence on off/intent-only bots. Record results in the mission Progress Log.
