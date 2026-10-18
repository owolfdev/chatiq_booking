# Mission: Booking sibling v1 (`chatiq-booking`)

Last updated: 2026-10-19  
Status: **In progress** — pilot create + admin **verified in ChatIQ chat**; next **WS-E command library**.  
Owner: Engineering

## Resume here (next session)

**Do this next, in order:**

1. **WS-E — Intent → command library** (in progress) — see [`booking-command-library.md`](./booking-command-library.md).
   - Contract: optional `command` + `slots` on turn handle.
   - Sibling executes closed catalog; ChatIQ may pre-select command.
   - Ship: `booking.create` (done) · `booking.lookup` · `booking.clarify` first; then cancel/reschedule/faq.
2. Later — widen `BOOKING_SIBLING_BOT_IDS`; archive legacy in-`chatiq` engine; payments / connect-link.

**Already done (do not redo):**
- Deploy: https://chatiq-booking.vercel.app/ — health `persistence: "supabase"`.
- Supabase project `crxwmkegmrusndpocntu`; migrations applied (core + slot unique).
- ChatIQ pilot: bot `booking-system-test-bot` (`ed98722d-bbad-485d-a187-c54b4429d544`), `BOOKING_RUNTIME=sibling`, allowlist, `booking_mode=full`.
- Chat smoke: “I want to book” → slot list → pick → confirmed; `/admin` shows schedule.
- Slot conflict: unique index + re-offer on clash; smoke `team-pilot` duplicate cancelled.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| **Shape** | Sibling Next.js app (`chatiq-booking/`), own git repo + Vercel project |
| **ChatIQ touch** | Thin HTTP adapter + `booking_mode` gate; no booking business logic in core chat |
| **Deploy** | https://chatiq-booking.vercel.app/ |
| **DB** | Dedicated Supabase `crxwmkegmrusndpocntu` |
| **Timezone** | Store timestamptz; pilot labels **Asia/Bangkok** |
| **Contacts** | Booking-owned `contacts` + `identity_bindings`; connect-link later |
| **Legacy** | Archive/tag old in-`chatiq` engine; mine docs, do not import runtime |
| **Rollout** | `BOOKING_SIBLING_BOT_IDS` allowlist for pilot; widen/clear at release |
| **Entry UX** | **Intent → typed command library** (not keyword canned as primary). Spec: [`booking-command-library.md`](./booking-command-library.md) |

## 1) Why

In-process booking in `chatiq` coupled core chat to a large engine. Extract to a sibling so trial-and-error cannot regress chat.

## 2) Definition of Done (v1 skeleton → pilot)

1. **Isolation** — Booking deploys cannot break core chat; `booking_mode=off` → zero sibling calls.
2. **Contract** — Health + turn handle v0 documented and implemented.
3. **Adapter** — ChatIQ calls sibling only when `BOOKING_RUNTIME=sibling` + URL/token + `booking_mode=full`; fail closed on error/timeout.
4. **Pilot slice** — One bookable happy-path + minimal admin (after Supabase). **Done.**
5. **Legacy** — Old engine tagged/archived off hot paths when sibling path is ready for a pilot bot.

## 3) Workstreams

### WS-A — Scaffold

- [x] Next.js app on port **3003**
- [x] `GET /api/health`, stub `POST /api/v1/turns/handle`
- [x] Env example + service token auth
- [x] Mission + API contract docs
- [x] Thin gated adapter in `chatiq` (`booking-sibling/`)
- [x] Deploy sibling to Vercel (`chatiq-booking.vercel.app`)

### WS-B — Vertical slice

- [x] Wire adapter into chat turn path for opted-in pilot bot (`BOOKING_SIBLING_BOT_IDS`)
- [x] Pilot env on ChatIQ + stub then real create smoke in chat
- [x] Provision + wire Supabase; migrations applied
- [x] Catalog + availability + create booking (`1`/`2`/`3`)
- [x] Minimal admin schedule (`/admin`)
- [x] Slot uniqueness / conflict handling

### WS-C — Identity (phased)

- [ ] Resolve by conversation/LINE binding
- [ ] Connect-link chat → web/app login
- [ ] Soft verified email/phone merge; admin merge

### WS-D — Archive legacy

- [ ] Inventory + git tag `pre-booking-sibling-archive`
- [ ] Remove old engine from hot paths; keep docs as legacy reference

### WS-E — Intent → command library

- [x] Spec + roadmap: [`booking-command-library.md`](./booking-command-library.md)
- [x] Extend turn API with optional `command` + `slots` + `confidence`
- [x] Sibling: route by command (`create` / `lookup` / `clarify`; stub later cmds)
- [x] ChatIQ: heuristic select command before calling sibling
- [ ] Map optional canned/buttons to same command IDs
- [x] `booking.lookup` + `booking.clarify` (pilot)
- [ ] `booking.cancel` / `reschedule` / `faq` (real handlers)

## 4) Progress Log

### 2026-10-19 — Pilot create verified + docs catch-up

**Changed / verified**
- Local ChatIQ → Vercel sibling: slot offer + book + admin visible.
- Fixed env-restart issue (LLM false path when `BOOKING_*` not loaded).
- Slot unique migration applied; smoke duplicate cancelled.

**Approx. toward DoD:** **~75%**.

```text
chatiq-booking: [###############_____] ~75% -> DoD
chatiq:         [##########__________] ~50% -> pilot sibling live; WS-E next
```

**Next:** implement WS-E command library (document then code — this session).

### 2026-10-19 — WS-E command library (v0)

**Changed**
- Docs: mission/roadmap/contract/command-library catch-up after pilot verify.
- Contract + sibling router: `command` / `slots` / `confidence`; `lookup` + `clarify` + create path.
- ChatIQ heuristic selector sends `command` on sibling turns.
- Vitest for command selection.

**Approx. toward DoD:** **~80%**.

```text
chatiq-booking: [################____] ~80% -> DoD
chatiq:         [###########_________] ~55% -> command select on pilot path
```

**Verified (chat):** lookup / create-with-existing / clarify all deterministic in pilot bot (2026-10-19).

**Next:** canned→command map; real cancel/reschedule handlers; later widen allowlist / archive legacy.

### Earlier (2026-10-17 → 2026-10-19)

Scaffold, adapter, chat wire-up, Supabase client, `booking.create`, admin, Vercel — see git history / prior Progress Log entries in repo if needed.
