# Mission: Booking sibling v1 (`chatiq-booking`)

Last updated: 2026-10-21  
Status: **In progress** — deterministic pilot **chat-smoked ✅**; design **locked: LLM concierge → deterministic commands** (see [`booking-command-library.md`](./booking-command-library.md)). Now **Phase 1: tool-ready sibling**.  
Owner: Engineering

## Resume here (next session)

**The one roadmap is this file (§2 DoD + §3 workstreams). Do this next, in order:**

1. **Phase 1 — Tool-ready sibling** (in `chatiq-booking`) — **code complete 2026-10-21; pending push/deploy + deployed smoke**
   - [x] Fix past-booking bug (`getLatestOpenBooking` now requires `starts_at >= now`, returns next upcoming) — 2026-10-21, typecheck ✅; live re-smoke after deploy.
   - [x] `POST /api/v1/commands/execute`: structured `{command, slots, actor}` → `{ok, data}`, no customer prose.
   - [x] `booking.list_services` + filterable `booking.get_availability` (service + date window + time-of-day, ≤5, future, not taken).
   - [x] Prove every command via direct API calls (no LLM): `npm run smoke:commands` — **20/20 checks pass locally** (real Supabase). Re-run against Vercel after deploy (`BOOKING_SMOKE_BASE_URL=https://chatiq-booking.vercel.app`).
2. **Phase 2 — LLM concierge** (in `chatiq`): tool loop on pilot bot; policy prompt + today/timezone context; smoke EN/TH/ZH + narrowing + next-month. See DoD P2.
3. **Phase 3 — Admin doors**: console (calendar/table, command buttons, ⌘K, commands reference, audit) → copilot with confirm-cards. See DoD P3.
4. Parallel/later — widen `BOOKING_SIBLING_BOT_IDS` per added bot (smoke each); WS-D code archive of legacy engine (docs already archived 2026-10-21); WS-C identity connect-link; payments.

**Minor known quirk (not blocking):** reschedule offer list can include the just-freed original slot (cancel-then-offer). Picking it would rebook the same time. Consider excluding the original `starts_at` from the reschedule offer later (or handle in LLM offer rendering in Phase 2).

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
| **Interpretation (locked 2026-10-21)** | **LLM interprets (any language) and drives the sibling via one fixed typed command set; sibling is deterministic/monolingual internally and never parses natural language; customer never touches the sibling directly.** Heuristic regexes = fallback/shortcuts only, never extended per-language. Full design: [`booking-command-library.md`](./booking-command-library.md) |
| **Admin (locked 2026-10-21)** | Same command bus, three interfaces: customer concierge (LLM), admin console (direct UI), admin copilot (LLM + human confirm-cards). Actor scope + audit on every command. |

## 1) Why

In-process booking in `chatiq` coupled core chat to a large engine. Extract to a sibling so trial-and-error cannot regress chat.

## 2) Definition of Done

### Already met (pilot foundation — do not redo)

1. **Isolation** — Booking deploys cannot break core chat; `booking_mode=off` → zero sibling calls. ✅
2. **Contract** — Health + turn handle v0 documented and implemented. ✅
3. **Adapter** — ChatIQ calls sibling only when `BOOKING_RUNTIME=sibling` + URL/token + `booking_mode=full`; fail closed on error/timeout. ✅
4. **Pilot slice** — Bookable happy-path + minimal admin on Supabase; create/lookup/clarify/cancel/reschedule chat-smoked (EN). ✅ 2026-10-21

### Phase 1 — Tool-ready deterministic sibling (`chatiq-booking`)

Done when **every command can be executed and verified via direct API calls with no LLM in the loop**:

- [x] Past bookings are never treated as upcoming (`starts_at >= now` in `getLatestOpenBooking`) — 2026-10-21
- [x] `POST /api/v1/commands/execute` returns structured data (no customer-facing prose) for: `list_services`, `get_existing`, `get_availability`, `create`, `cancel`, `reschedule`
- [x] `get_availability` filters by service + date window + optional time-of-day; returns ≤ 5 slots, all future, none taken
- [x] Mutations validate server-side: slot still open, booking exists & upcoming, cancel/reschedule require `confirmed=true`
- [x] API exit tests pass: `npm run smoke:commands` 20/20 locally (create→lookup→reschedule→cancel; double-book rejected; confirmation gate; past create rejected; past/evening windows empty-not-error). Deployed re-run pending push.

### Phase 2 — LLM concierge (`chatiq`)

Done when **a customer can complete the full booking lifecycle in their own language, with the LLM only ever calling sibling commands**:

- [ ] Booking tools registered only for `booking_mode=full` + allowlisted bots; sibling remains unreachable otherwise
- [ ] Policy prompt live: never invent slots/services; confirm before mutating; reply in customer's language; today + timezone injected
- [ ] Narrowing works: service → week → day → time-of-day, skipping already-stated info; ≤ 5 slots offered; "more" re-queries next window
- [ ] Smoke passes (pilot bot): English, Thai, and Chinese full flows (book / check / cancel / reschedule); "next month" request resolves to a future window; LLM offers only sibling-returned slots
- [ ] Fail-closed preserved: sibling down → no booking action, core chat continues

### Phase 3 — Admin doors (same command bus)

Done when **human agents can run the same operations directly and via natural language, with accountability**:

- [ ] `/admin` console: calendar + table views, booking detail with command buttons (reschedule/cancel/no-show/create-on-behalf), filters
- [ ] Commands reference page + ⌘K palette listing every command, inputs, and who may run it
- [ ] Actor scope enforced (customer=own, provider=own calendar, agent=team) and every mutation audit-logged (actor, via UI/LLM, before→after)
- [ ] Admin copilot: NL → proposed command card → human Confirm/Edit/Dismiss; read-only NL queries answered from command results; admin changes notify the customer in their language via ChatIQ

### Overall v1 DoD

Phases 1–2 complete on the pilot bot + Phase 3 console (copilot may trail). Legacy in-`chatiq` booking docs archived (done 2026-10-21); legacy code tagged `pre-booking-sibling-archive` and off hot paths (WS-D).

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

- [x] **Docs:** legacy in-`chatiq` booking docs archived 2026-10-21 (`chatiq/dev_docs/booking-system/_archive/2026-legacy-engine/`, 32 files; index in `booking-system/README.md`) — superseded, do not follow
- [ ] Code: git tag `pre-booking-sibling-archive` in `chatiq`
- [ ] Code: remove old engine from hot paths (docs stay as legacy reference)

### WS-E — Intent → command library (v0, heuristic — superseded direction)

- [x] Spec + roadmap: [`booking-command-library.md`](./booking-command-library.md)
- [x] Extend turn API with optional `command` + `slots` + `confidence`
- [x] Sibling: route by command (`create` / `lookup` / `clarify` / `cancel` / `reschedule` / `faq`)
- [x] ChatIQ: heuristic select command before calling sibling
- [x] Map canned `booking_start` / `booking_command` → sibling command IDs
- [x] `booking.lookup` + `booking.clarify` + cancel confirm + reschedule
- Note: heuristics now **fallback/shortcuts only** under the locked LLM-concierge design; do not extend them per-language.

### WS-F — Phase 1: tool-ready sibling

- [x] Past-booking bug fix (`starts_at >= now`)
- [x] `POST /api/v1/commands/execute` (structured in/out, actor context)
- [x] `booking.list_services`; filterable `booking.get_availability` (window, time-of-day, ≤5)
- [x] Server-side mutation validation (`confirmed=true`, future/open checks; reschedule creates new before cancelling old)
- [x] API exit tests (no LLM): `scripts/smoke-commands.mjs` — 20/20 pass locally; deployed re-run pending push

### WS-G — Phase 2: LLM concierge (ChatIQ)

- [ ] Register booking tools only on gated bots; policy prompt + today/timezone injection
- [ ] Tool loop calls sibling commands/execute; LLM renders replies in customer language
- [ ] Narrowing + "more" pagination via re-query
- [ ] Smoke: EN / TH / ZH full flows + next-month + returned-slots-only

### WS-H — Phase 3: admin doors

- [ ] `/admin` console: calendar/table, detail command buttons, filters
- [ ] Commands reference + ⌘K palette; actor scopes; audit log
- [ ] Copilot: NL → confirm-card → execute; customer notification on admin changes

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

### 2026-10-21 — Phase 1: tool-ready sibling (commands API + exit smoke)

**Changed**
- `POST /api/v1/commands/execute` (`src/lib/command-execute.ts` + route): `list_services`, `get_existing`, `get_availability`, `create`, `cancel`, `reschedule`. Structured `{ok, data}` / `{ok:false, code}`; actor context; customer ownership scoping; staff bypass for Phase 3.
- Availability: `searchAvailability` — local date window + `time_of_day` (morning=10:00, afternoon=14:00, evening=none in pilot) + ≤5, future, untaken. Turn-handler offer path unchanged.
- Store: `listCatalogItems`, `getContactById`, `getBookingById`.
- Reschedule via commands creates the new booking **before** cancelling the old (conflict-safe, improves on turn-handler order).
- Contract types + `api-contract-v0.md` commands section.

**Verified**
- `npm run typecheck` ✅
- `npm run smoke:commands` against local server + real Supabase: **20/20 checks** (services, filtered availability incl. morning/evening/past windows, create→existing→double-book `SLOT_TAKEN`→confirmation gate→reschedule→cancel→past-create `SLOT_IN_PAST`). Smoke bookings cleaned up (cancelled).

**Approx. toward DoD:** Phase 1 **~90%** (only deployed re-run outstanding).

```text
chatiq-booking: Phase 1 (tool-ready): [##################__] ~90%
```

**Next:** push + deploy, re-run smoke against Vercel (`BOOKING_SMOKE_BASE_URL=https://chatiq-booking.vercel.app npm run smoke:commands`), then Phase 2 LLM tool loop in `chatiq`.

### 2026-10-21 — Design locked: LLM concierge; Phase 1 started; legacy docs archived

**Decided (with user)**
- LLM interprets in any language and drives the sibling via one fixed typed command set; sibling stays deterministic/monolingual, never parses NL; customer never touches the sibling directly. Heuristics demoted to fallback/shortcuts.
- Narrowing by conversation (service → week → day → time-of-day), ~7-day search windows, ≤5 slots.
- Admins: same command bus via console (direct) + copilot (NL with human confirm-cards); actor scope + audit.
- Full design: [`booking-command-library.md`](./booking-command-library.md) (rewritten); DoD restructured into Phase 1/2/3 exit criteria (§2).

**Changed**
- Bug fix: `getLatestOpenBooking` requires `starts_at >= now` and returns the next upcoming booking (past 20 Oct booking was treated as current in smoke). Typecheck ✅. Live re-smoke pending next deploy.
- Docs: legacy `chatiq/dev_docs/booking-system/*` (32 files) archived to `_archive/2026-legacy-engine/` with a superseded index README; active pointers updated (`_active-focus`, `mission-lifecycle`, workspace `ROADMAP`/`AGENTS`).

**Approx. toward DoD:** pilot foundation ✅; **Phase 1 ~15%** (bug fix done, commands/execute next).

```text
chatiq-booking: [##################__] ~90% -> pilot foundation DoD | Phase 1 (tool-ready): ~15%
```

**Next:** `POST /api/v1/commands/execute` + `list_services` + filterable `get_availability`, then API exit tests.

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
