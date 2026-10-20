# Mission: Booking sibling v1 (`chatiq-booking`)

Last updated: 2026-10-21  
Status: **In progress** — WS-E **chat-smoked (cancel + reschedule pass)**; next **widen allowlist / archive legacy**.  
Owner: Engineering

## Resume here (next session)

**Do this next, in order:**

1. **Widen allowlist** — add more bot IDs to `BOOKING_SIBLING_BOT_IDS` in `chatiq/.env.local` (+ Vercel env if prod chat needs it), restart ChatIQ, smoke each added bot (`book` → slot → confirm). Or clear the gate only when ready for broader pilot.
2. **WS-D — Archive legacy** — tag `pre-booking-sibling-archive` in `chatiq`; remove old in-`chatiq` booking engine from hot paths; keep `dev_docs/booking-system/` as legacy reference.
3. Later — LLM tool-select for commands; payments; connect-link identity (WS-C).

**Minor known quirk (not blocking):** reschedule offer list can include the just-freed original slot (cancel-then-offer). Picking it would rebook the same time. Consider excluding the original `starts_at` from the reschedule offer later.

**Already done (do not redo):**
- Deploy: https://chatiq-booking.vercel.app/ — health `persistence: "supabase"`.
- Supabase project `crxwmkegmrusndpocntu`; migrations applied (core + slot unique).
- ChatIQ pilot: bot `booking-system-test-bot` (`ed98722d-bbad-485d-a187-c54b4429d544`), `BOOKING_RUNTIME=sibling`, allowlist, `booking_mode=full`.
- Chat smoke: create → slots → confirm → `/admin`; lookup / create-guard / clarify verified.
- Slot conflict: unique index + re-offer on clash; smoke `team-pilot` duplicate cancelled.
- WS-E: command catalog + ChatIQ heuristics + canned→command map + cancel confirm + reschedule.
- Chat-smoke 2026-10-21: cancel (confirm → cancelled, lookup empty) + reschedule (10:00 → 14:00) verified in DB via admin API: `2b8671b4` cancelled, `c13789f4` confirmed.

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
- [x] Sibling: route by command (`create` / `lookup` / `clarify` / `cancel` / `reschedule` / `faq`)
- [x] ChatIQ: heuristic select command before calling sibling
- [x] Map canned `booking_start` / `booking_command` → sibling command IDs
- [x] `booking.lookup` + `booking.clarify` + cancel confirm + reschedule

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

### 2026-10-19 — Canned map + cancel / reschedule

**Changed**
- ChatIQ: canned `booking_start` / `action_config.booking_command` → sibling command shortcut.
- Sibling: `booking.cancel` (yes/no confirm) + `booking.reschedule` (cancel then new slots) + faq stub.

**Approx. toward DoD:** **~85%**.

```text
chatiq-booking: [#################___] ~85% -> DoD
```

**Next:** chat-smoke cancel/reschedule; later widen allowlist / archive legacy / LLM tool select.

### 2026-10-21 — Chat-smoke cancel + reschedule ✅

**Verified (live chat, local ChatIQ → Vercel sibling; admin API cross-check)**
- Existing-booking guard: `I want to book` with an active Consultation → offered check/cancel/reschedule, not a duplicate.
- Cancel: `Please cancel my booking` → confirm prompt → `yes` → `Cancelled…`; subsequent lookup: “I don’t see an upcoming Consultation” — DB: Tue 20 Oct 10:00 (Asia/Bangkok) booking `status=cancelled`.
- Create: slots offered → booked Wed 21 Oct 10:00, id `2b8671b4`.
- Reschedule: `please reschedule my appointment` → new slot list → picked `2` → booked Wed 21 Oct 14:00, id `c13789f4`. DB: `2b8671b4` now `cancelled`, `c13789f4` `confirmed` at 07:00 UTC (= 14:00 Bangkok). Cancel-then-rebook semantics confirmed.
- Note: reschedule list included the freed 10:00 slot (see Resume-here quirk).

**Approx. toward DoD:** **~90%**.

```text
chatiq-booking: [##################__] ~90% -> DoD
chatiq:         [#############_______] ~65% -> pilot path fully smoked (create/lookup/clarify/cancel/reschedule)
```

**Next:** widen `BOOKING_SIBLING_BOT_IDS`; then WS-D archive legacy.

### 2026-10-19 — EOD handoff (stop for tomorrow)

**Changed / state**
- Code for WS-E (incl. cancel/reschedule + canned map) already on `main` for both repos; working trees clean before this doc commit.
- No further product code this evening — handoff docs only.

**Verified earlier today:** create / lookup / clarify / admin. **Not yet chat-smoked:** cancel confirm + reschedule (unit tests covered; live chat pending).

**Approx. toward DoD:** **~85%** (unchanged).

```text
chatiq-booking: [#################___] ~85% -> DoD
chatiq:         [############________] ~60% -> sibling path + heuristics + canned map live
```

**Tomorrow first action:** live chat-smoke cancel → yes; then reschedule → new slot; confirm `/admin`. See **Resume here**.

### Earlier (2026-10-17 → 2026-10-19)

Scaffold, adapter, chat wire-up, Supabase client, `booking.create`, admin, Vercel — see git history / prior Progress Log entries in repo if needed.
