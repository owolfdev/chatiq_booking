# Mission: Booking sibling v1 (`chatiq-booking`)

Last updated: 2026-10-28

Status: **Engine ✅** · **Track C operator UI ~98% shipped; production pilot ✅ (operator confirmed 2026-10-28)**. ChatIQ schedule/settings and Booking links live; legacy Bookings is hidden; sibling `/admin` is ops-only. Optional next: archive legacy dashboard code; time blocks / customers in ChatIQ; or Watch / core chat. **Roadmap (git):** [`../ROADMAP.md`](../ROADMAP.md). Workspace index: [`../../ROADMAP.md`](../../ROADMAP.md). Spec: [`chatiq-booking-operator-ui.md`](./chatiq-booking-operator-ui.md). Design: [`booking-command-library.md`](./booking-command-library.md) · Identity: [`identity-and-account-linking.md`](./identity-and-account-linking.md) · Catalog: [`service-catalog-and-availability.md`](./service-catalog-and-availability.md) · Modules: [`base-and-shape-modules.md`](./base-and-shape-modules.md).

Owner: Engineering

## Resume here (next session)

**Next action (2026-10-28): other lanes.** Track C operator UI is production-confirmed; legacy global Bookings UI archived. Prefer **Watch Phase B** or core chat from [`../ROADMAP.md`](../ROADMAP.md) / workspace [`../../ROADMAP.md`](../../ROADMAP.md).

**How to open it:** My Bots → **Booking** on a `booking_mode=full` bot; links also appear in bot Settings, bot preview, and `/chat/[slug]` when sibling runtime is configured. The booking mode dropdown controls chat routing.

- Schedule: `/dashboard/bots/[slug]/booking`  
- Setup: `/dashboard/bots/[slug]/booking/settings`  

Needs `BOOKING_RUNTIME=sibling` + URL + token on that ChatIQ deploy.

**Logged revisions (local `main` = `origin/main`, 2026-10-28):**

| Repo | HEAD | Notes |
|------|------|--------|
| `chatiq-booking` | `3bad3a9` | Sync booking operator spec and agent handoff |
| `chatiq-booking` | `e282541` | Document Booking navigation entry points |
| `chatiq-booking` | `7b68459` | Fix staff booking deletion and verify removed rows |
| `chatiq` | `4432967a` | Update booking pilot handoff |
| `chatiq` | `62ea7790` | Add Booking links to bot management and test pages |
| `chatiq` | `f40ede42` | Improve booking schedule feedback and save view preferences |

**Production:** Operator confirmed booking works in production (2026-10-28).

### Track C — ChatIQ operator UI — mostly done

9. ~~**Per-bot booking settings in ChatIQ**~~ ✅ **v1+ DONE 2026-10-26** — shapes, services, hours (+ closed dates), resources CRUD, eligibility + person+room linking. Blocks / custom exception windows still sibling `/admin` if needed.  
10. ~~**Per-bot schedule in ChatIQ**~~ ✅ **DONE 2026-10-26** — list + cancel / reschedule / no-show / create-on-behalf; October 27 hard-delete, status filter, progress feedback, and per-user/bot view preferences. Staff API: `/api/booking/staff/*`.
11. ~~**Hide legacy `/dashboard/bookings`**~~ ✅ **DONE 2026-10-26** — soft landing; dashboard snapshot → My Bots.  
11b. ~~**Archive legacy `/dashboard/bookings` UI**~~ ✅ **DONE 2026-10-28** — old routes removed; catch-all soft landing; Bookings nav gone.  
12. ~~**Demote sibling `/admin`**~~ ✅ **DONE 2026-10-26** — docs frame `/admin` as ops/pilot only; ChatIQ is the product surface.

**After Track C:** optional time blocks in ChatIQ, payments, large-catalog prompts; or Watch / core chat from [`../ROADMAP.md`](../ROADMAP.md).

### Track A — Base + appointments (complete)

1. ~~**Phase 1 — Tool-ready sibling**~~ ✅ **DONE 2026-10-21**
2. ~~**Phase 2 — LLM concierge**~~ ✅ **DONE 2026-10-21** (`BOOKING_CONCIERGE=llm` local; add to ChatIQ Vercel when prod should match)
3. ~~**Phase 3a — Identity & account linking**~~ ✅ **DONE 2026-10-25**
4. ~~**Phase 3b.0 — Service catalog & hours**~~ ✅ **DONE 2026-10-25**
5. ~~**Phase 3b — Admin doors**~~ ✅ **DONE 2026-10-25** (Schedule → Copilot + customer notify)

**Optional A polish:** large-catalog concierge prompts; widen allowlist; Vercel concierge flag; WS-D archive; payments.

### Track B — Shape modules

6. ~~**`resources`**~~ ✅ **v1 DONE 2026-10-26** — shapes, eligibility, any/specific, `/admin/resources`, concierge tools.
7. ~~**`stays`**~~ ✅ **v1 DONE 2026-10-26** — `ends_at`, room-type capacity, check-in/out availability, `/admin/stays`, `npm run smoke:stays`, concierge stay slots.

### Track B+ — Multi-resource linking (complete)

8. ~~**Person + room linking**~~ ✅ **DONE 2026-10-26** — `require_resource_kinds`, `booking_resources`, both must be free; `/admin/resources` toggle; `npm run smoke:resource-linking`.

**Optional (does not block Track C):** live hotel/clinic chat smoke; payments; large-catalog prompts.

**Live pilot context (do not rediscover):**
- LINE OA bot: `chatiq-line-guide` / `c967a5c0-b0dc-489e-b778-835b5c294588` — `booking_mode=full`, on ChatIQ `BOOKING_SIBLING_BOT_IDS` (with pilot).
- Pilot web bot: `booking-system-test-bot` / `ed98722d-bbad-485d-a187-c54b4429d544`.
- Linked smoke customer: survivor contact `8f94e5d6-…`; LINE `U524c2d98…` + `web_user` `cc875ce1-…`; booking `6499b0ef-…` Consultation **2026-10-27 10:00 Asia/Bangkok**.
- Web chat proof URL: https://www.chatiq.io/chat/chatiq-line-guide
- Env: ChatIQ Vercel has allowlist + `BOOKING_RUNTIME=sibling`; booking Vercel has `BOOKING_CONNECT_URL_BASE=https://www.chatiq.io/booking/connect`. Local ChatIQ also has `BOOKING_CONCIERGE=llm` (not required on Vercel for LINE if already set for this pilot path — confirm if prod LINE concierge misbehaves).

**Minor known quirk (not blocking):** reschedule offer list can include the just-freed original slot (cancel-then-offer).

**Already done (do not redo):**
- Deploy: https://chatiq-booking.vercel.app/ — health `persistence: "supabase"`.
- Supabase project `crxwmkegmrusndpocntu`; migrations applied (core + slot unique + identity).
- ChatIQ pilot + LINE guide on allowlist; `booking_mode=full` on both.
- Phases 1–2 smokes; Phase 3a API/concierge/consent; live LINE→web link + web post-merge lookup (2026-10-24).

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| **Shape** | Sibling Next.js app (`chatiq-booking/`), own git repo + Vercel project |
| **ChatIQ touch** | Thin HTTP adapter + `booking_mode` gate; no booking business logic in core chat |
| **Deploy** | https://chatiq-booking.vercel.app/ |
| **DB** | Dedicated Supabase `crxwmkegmrusndpocntu` |
| **Timezone** | Store timestamptz; pilot labels **Asia/Bangkok** |
| **Contacts** | Booking-owned `contacts` + `identity_bindings`; connect-link in Phase 3a |
| **Identity (locked 2026-10-21)** | **Every channel account (web login, LINE user ID) is a legitimate first-class customer account; bookings belong to the customer, channel accounts are keys. Merge only on proof of control of BOTH accounts in one ceremony (one-time token + consent + both-channel notification); never merge on claimed name/phone/email.** Spec: [`identity-and-account-linking.md`](./identity-and-account-linking.md) |
| **Legacy** | Archive/tag old in-`chatiq` engine; mine docs, do not import runtime |
| **Rollout** | `BOOKING_SIBLING_BOT_IDS` allowlist for pilot; widen/clear at release |
| **Entry UX** | **Intent → typed command library** (not keyword canned as primary). Spec: [`booking-command-library.md`](./booking-command-library.md) |
| **Interpretation (locked 2026-10-21)** | **LLM interprets (any language) and drives the sibling via one fixed typed command set; sibling is deterministic/monolingual internally and never parses natural language; customer never touches the sibling directly.** Heuristic regexes = fallback/shortcuts only, never extended per-language. Full design: [`booking-command-library.md`](./booking-command-library.md) |
| **Admin (locked 2026-10-21; surface updated 2026-10-26)** | Same command bus, three interfaces: customer concierge (LLM), **operator UI in ChatIQ** (direct UI; sibling `/admin` = temporary/ops), admin copilot (LLM + human confirm-cards). Actor scope + audit on every command. Product surface: [`chatiq-booking-operator-ui.md`](./chatiq-booking-operator-ui.md). |
| **Catalog (locked 2026-10-24)** | Owner-configured, business-agnostic services + hours; shared calendar per bot in v1; 1–100 services via list/search. Spec: [`service-catalog-and-availability.md`](./service-catalog-and-availability.md). |
| **Modules (locked 2026-10-24)** | One sibling = **base** + optional **shape modules** (`appointments` default, then `resources`, then `stays`). Not one app per industry. Spec: [`base-and-shape-modules.md`](./base-and-shape-modules.md). |
| **Operator UI (locked 2026-10-26)** | **Settings + schedule live in ChatIQ** (team auth, per bot). Sibling = engine only. Legacy `/dashboard/bookings` hidden then deleted. Spec: [`chatiq-booking-operator-ui.md`](./chatiq-booking-operator-ui.md). |

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
- [x] API exit tests pass: original `npm run smoke:commands` 20/20 locally and deployed (2026-10-21); October 27 local run includes hard-delete and confirms a second delete returns `BOOKING_NOT_FOUND`. Deployed re-run of the October 27 change remains pending.

### Phase 2 — LLM concierge (`chatiq`)

Done when **a customer can complete the full booking lifecycle in their own language, with the LLM only ever calling sibling commands**:

- [x] Booking tools registered only for `booking_mode=full` + allowlisted bots (+ `BOOKING_CONCIERGE=llm`); sibling remains unreachable otherwise
- [x] Policy prompt live: never invent slots/services; confirm before mutating; reply in customer's language; today + timezone injected
- [x] Narrowing implemented: service → week → day → time-of-day, skipping already-stated info; ≤ 3 slots offered; "more" re-queries next window (live verification in smoke below)
- [x] Smoke passes (pilot bot) 2026-10-21: EN conversational narrowing (service→week→day→morning→booked, DB-verified); TH lookup + cancel (`ใช่` executed first try); ZH next-month create (Fri 6 Nov 10:00 confirmed) + lookup; cancel confirmation enforced; mid-thread language switch enforced (script detection + rewrite)
- [x] Fail-closed preserved: concierge failure → deterministic sibling turn; sibling down → no booking action, core chat continues

### Phase 3a — Identity & account linking (LINE ↔ web) — ✅ DONE 2026-10-25

Spec: [`identity-and-account-linking.md`](./identity-and-account-linking.md). Done when **a customer who booked at one door is recognized at the other after a secure link**:

- [x] Migration: `connect_tokens` (hashed, one-time, 10-min), `identity_audit_log`, `contacts.merged_into`/status — applied 2026-10-23 via Supabase CLI (`db push`)
- [x] `booking.create_connect_token` / `booking.redeem_connect_token` / `booking.get_customer`; merge is internal-only, deterministic survivor rule, tombstone + audit, `MERGE_CONFLICT` aborts safely
- [x] API exit tests (no LLM): `npm run smoke:identity` on Vercel — merge + token errors + **enrichment asserts** PASS (2026-10-25 re-run)
- [x] Channel smokes (live): LINE book; LINE→web consent; post-merge web lookup (2026-10-24); **web→LINE short-code** (2026-10-25) — LINE confirmed link + Tue 10:00 booking
- [x] Both-channel "accounts linked" tripwire built (2026-10-25) — ChatIQ notify after fresh redeem (consent + concierge); LINE push + web `bot_messages`
- [x] Tripwire delivery verified 2026-10-25 — `npx tsx scripts/smoke-link-notify.ts` → `line: sent`, `web: sent` (pilot pair already linked; forces notify path)
- [x] Concierge linking conversation built + **live EN→TH smoke PASS 2026-10-24** (`chatiq/tests/booking-sibling-concierge-live.test.ts`; unit 12/12; sibling timeout raised for merge)
- [x] Consent page built + **go-live 2026-10-24** + **signed-in Link-accounts PASS** (live LINE token)
- [x] Contact enrichment: LINE display-name snapshot; web name/email via `contact_profile` (display only) — 2026-10-25
- [x] Daily DB keepalive: `"update"` table + `/api/cron/update` + Vercel cron + `CRON_SECRET` (ping verified 2026-10-25)

### Phase 3b.0 — Service catalog & availability (before / with admin console)

Spec: [`service-catalog-and-availability.md`](./service-catalog-and-availability.md). Done when **an owner can configure 1–N services and business hours without code changes**, and customer availability honors those rules:

- [x] Design locked 2026-10-24 (shared calendar v1; catalog fields; hours/exceptions/blocks; admin + search commands; concierge scaling)
- [x] Schema + admin commands + API smoke (no LLM): `catalog.*`, `availability.*`; hours-aware `get_availability`; seed Consultation/default hours only when empty — 2026-10-25
- [x] `/admin` Services + Hours UI — 2026-10-25
- [ ] ~~Concierge large-catalog prompt rules~~ → **deferred** (Later / item 7; `booking.search_services` already live)

### Phase 3b — Admin doors (same command bus)

Done when **human agents can run the same operations directly and via natural language, with accountability**:

- [x] `/admin` Schedule: week calendar + table + filters + detail cancel/reschedule (2026-10-25 slice 1)
- [x] Booking detail: no-show + create-on-behalf (2026-10-25 slice 2)
- [x] Customer detail (channel accounts, identity audit, unmerge) (2026-10-25 slice 3)
- [x] Commands reference page + ⌘K palette listing every command, inputs, and who may run it (2026-10-25 slice 4)
- [x] Actor scope enforced (customer=own; staff/provider=team bot calendar in v1) + mutation audit log (2026-10-25 slice 5)
- [x] Admin copilot: NL → proposed command card → Confirm/Edit/Dismiss; read-only via confirm (2026-10-25 slice 6)
- [x] Admin changes notify the customer via ChatIQ (LINE + web; EN/TH/zh) (2026-10-25 slice 7)

### Track C — ChatIQ operator UI (product surface)

Spec: [`chatiq-booking-operator-ui.md`](./chatiq-booking-operator-ui.md). Done when **subscribers configure booking and manage the schedule inside ChatIQ**, without the sibling service token or legacy engine UI:

- [x] ChatIQ server helper: staff-scoped sibling `commands/execute` for bots the user can manage (token never in browser) — 2026-10-26
- [x] Per-bot **schedule** in ChatIQ (list + cancel / reschedule / no-show / create-on-behalf) — 2026-10-26
- [x] Per-bot **settings** in ChatIQ (shapes, services, hours + closed dates, resources, eligibility / person+room) — 2026-10-26
- [x] Legacy `/dashboard/bookings` hidden + soft landing when sibling runtime — 2026-10-26
- [x] Legacy `/dashboard/bookings` UI archived (routes deleted; catch-all soft landing) — 2026-10-28
- [x] Sibling `/admin` demoted to ops-only in docs — 2026-10-26
- [x] Booking links on gallery, bot Settings, preview, and internal test page for full bots when sibling runtime is configured — 2026-10-27
- [x] Schedule progress feedback, Status/When/Sort filters, and per-user/bot saved view choices — 2026-10-27
- [x] Production pilot verification — operator confirmed booking works in production (2026-10-28); HEADs logged above

### Overall v1 DoD

Phases 1–2 + 3a + 3b.0 + 3b console + shape modules (`resources` / `stays` / linking) ✅ on the engine. Track C operator UI ~98% shipped + production-confirmed. Legacy in-`chatiq` booking docs were archived (2026-10-21); legacy dashboard code is hidden and remains for later archive.

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

### WS-C — Identity & account linking (= Phase 3a; spec: [`identity-and-account-linking.md`](./identity-and-account-linking.md))

- [x] Resolve by conversation/LINE binding (claims → contact; **live LINE bot verified 2026-10-24**)
- [x] Migration: `connect_tokens`, `identity_audit_log`, `contacts.merged_into` (applied 2026-10-23)
- [x] Connect token issue/redeem + internal merge (survivor rule, tombstone, audit, conflict abort)
- [x] `booking.get_customer` (customer-scoped across bots); contact enrichment still pending
- [x] API exit tests: `scripts/smoke-identity.mjs` incl. cross-bot full-token redeem + `TOKEN_EXPIRED`
- [x] Concierge linking conversation: identity tools + prompt + consent gate; unit 12/12; **live EN→TH smoke PASS 2026-10-24**
- [x] Consent page go-live + signed-in redeem PASS; `BOOKING_CONNECT_URL_BASE` on booking Vercel
- [x] Channel: LINE book + LINE→web + post-merge web lookup (2026-10-24); web→LINE short-code (2026-10-25)
- [x] Channel: both-channel link notifications built + delivery verified (2026-10-25)
- [x] Admin unmerge lands in WS-H (`booking.admin_unmerge` + `/admin/customers`, 2026-10-25)

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
- [x] API exit tests (no LLM): `scripts/smoke-commands.mjs` — **20/20 pass locally and on Vercel** (2026-10-21, after `452ce35` deploy)

### WS-G — Phase 2: LLM concierge (ChatIQ)

- [x] Register booking tools only on gated bots (`BOOKING_CONCIERGE=llm` + sibling gates); policy prompt + today/timezone injection (`chatiq/src/lib/booking-sibling/concierge.ts`)
- [x] Tool loop calls sibling `commands/execute`; LLM renders replies in customer language; failure → deterministic sibling fallback
- [x] Narrowing + "more" pagination via re-query (prompt policy: ≤7-day windows, ≤3 offered)
- [x] Smoke: EN / TH / ZH full flows + next-month + returned-slots-only (2026-10-21, DB-verified)
- [x] Identity tools in concierge (create/redeem connect token, get_customer) + linking prompt rules + deterministic consent gate (2026-10-23); live linking smoke harness committed, run pending valid OpenAI key

### WS-H — Phase 3b.0 catalog + Phase 3b admin doors

- [x] **3b.0 design locked** — [`service-catalog-and-availability.md`](./service-catalog-and-availability.md) (2026-10-24); **schema/UI deferred until Phase 3a leftovers**
- [x] 3b.0 schema + admin commands + `search_services` + smoke (2026-10-25)
- [x] 3b.0 Services/Hours admin UI (2026-10-25)
- [x] `/admin` Schedule calendar/table + cancel/reschedule/no-show/create-on-behalf (2026-10-25)
- [x] `/admin/customers` identity detail + `booking.admin_list_identity_audit` / `booking.admin_unmerge` (2026-10-25)
- [x] Commands reference + ⌘K palette (`/admin/commands`, catalog-driven) (2026-10-25)
- [x] Actor scopes + `command_audit_log` + `/admin/audit` (2026-10-25)
- [x] Copilot: NL → confirm-card → execute (`/admin/copilot`, 2026-10-25)
- [x] Customer notification on admin changes via ChatIQ (2026-10-25)

## 4) Progress Log

### 2026-10-31 — Stay guest count (v1)

**What changed:**
- `chatiq-booking`: migration `max_guests` on `catalog_items` (default 2) + `guest_count` on `bookings`; list/upsert/create wire-up; stay create requires `guest_count` and returns `OCCUPANCY_EXCEEDED` (with rooms_needed) when over `max_guests`; admin services UI field.
- `chatiq`: settings “Max guests per room”; concierge asks guest count on stays, passes `guest_count` on create, handles occupancy errors.

**Verified:** `npm run typecheck` in both repos; migration applied to booking Supabase (`20261031000000_guest_occupancy`).

**Approx. toward DoD:** stay occupancy polish (engine + concierge); Track C still ~98%.

```text
chatiq-booking: stay guest_count v1: [####################] 100% -> simple guest ask/enforce
chatiq:         stay guest_count v1: [####################] 100% -> settings + concierge
```

**Next:** Deploy booking sibling + ChatIQ; smoke Charoen House “how many guests?”; optional raise `max_guests` on larger room types. Dual-room create still later.

### 2026-10-28 — Archive legacy ChatIQ `/dashboard/bookings` UI

**What changed (`chatiq`):** Removed the global Bookings dashboard tree (clients, workflow/setup routes). Replaced with `bookings/[[...slug]]` soft landing → My Bots. Dropped sidebar Bookings item; dashboard snapshot always points at My Bots. Updated tests + roadmaps.

**Verified:** targeted Vitest `booking-dashboard-ui.test.tsx` (run in this session if listed); typecheck/lint on touched paths.

**Approx. toward DoD:** Track C checklist item “archive legacy dashboard” **done**. Product still ~98% (optional time-blocks / engine WS-D remain).

```text
chatiq: Operator UI (Track C): [####################] ~99% -> DoD (UI archive)
```

**Next:** Commit `chatiq` (+ pending ROADMAP docs in other repos). Then Watch Phase B or core chat.

### 2026-10-28 — Per-repo ROADMAP.md (git) + workspace index

**What changed (docs):** Added root `ROADMAP.md` to each active checkout (`chatiq-booking`, `chatiq`, `chatiq-watch`, Inbox, bot-pages). Booking Track A–C detail now lives in `chatiq-booking/ROADMAP.md` (committed). Workspace `ROADMAP.md` / `AGENTS.md` are thin indexes (not in git). Pointed READMEs / AGENTS / `_active-focus` at the new roots.

**Verified:** Files written; no code change.

**Approx. toward DoD:** no change to product DoD (~98% Track C).

**Next:** Commit roadmap docs in each repo (start with `chatiq-booking`); then optional legacy archive or Watch Phase B.

### 2026-10-28 — Production confirmed; commit HEADs logged

**What changed (docs):** Operator stated booking works in production. Logged current `main` HEADs (`chatiq-booking` `3bad3a9`, `chatiq` `4432967a`) including delete fix `7b68459` and ChatIQ schedule/nav `f40ede42` / `62ea7790`. Marked Track C production pilot verification done in Resume/DoD.

**Verified:** Git `main` clean and tracking `origin/main` in both repos. Production pass is operator confirmation (not a re-run of the disposable delete checklist in this session).

**Approx. toward DoD:** Track C **~98%** (implementation); production gate **done**.

```text
chatiq:         Operator UI (Track C): [###################_] ~98% -> DoD
chatiq-booking: engine / command support: [####################] ~100% -> implementation DoD
```

**Next:** Optional archive of legacy `/dashboard/bookings` code, or Watch Phase B / core chat per roadmap.

### 2026-10-27 — Handoff sync after pushed operator UI fixes

**Changed (docs only):** Updated mission Resume/DoD, operator UI spec, project docs/agent handoff, ChatIQ focus, and workspace roadmap/agent notes to distinguish pushed implementation from unverified production behavior. The next action is the deployed pilot checklist above; legacy dashboard archive and optional features follow it.

**Verified:** Git `main` was clean and matched `origin/main` in both repos at the start of this documentation pass; prior local `smoke:commands` hard-delete check and both typechecks are recorded in the entries below. No new production/browser verification in this docs pass.

**Approx. toward DoD:** Track C **~98%**, no change from documentation.

```text
chatiq:         Operator UI (Track C): [###################_] ~98% -> DoD
chatiq-booking: engine / command support: [####################] ~100% -> implementation DoD
```

**Next:** Confirm deployed revisions, run the disposable pilot delete/UI/navigation checklist in Resume here, and log each result. Then decide whether to archive the legacy dashboard code or move to Watch Phase B.

### 2026-10-27 — Booking navigation from bot surfaces

**Changed:** ChatIQ now shows a Booking link on My Bots gallery cards, bot Settings, bot preview, and internal `/chat/[slug]` test page for bots with `booking_mode=full` when the sibling runtime is configured. The gallery query now includes `booking_mode`. The operator UI spec lists these entry points.

**Verified:** `npm run typecheck` in `chatiq`; targeted ESLint (0 errors, 2 pre-existing warnings); `git diff --check`. Browser navigation smoke remains pending.

**Approx. toward DoD:** Track C **~98%**, unchanged (discoverability polish).

```text
chatiq: Operator UI (Track C): [###################_] ~98% -> DoD
```

**Next:** On a deployed build, verify links appear for a full booking bot and stay hidden for off/intent-only bots across gallery, Settings, preview, and internal chat. Continue the pending production delete check.

### 2026-10-27 — Persist ChatIQ schedule view preferences

**Changed:** ChatIQ `/dashboard/bots/[slug]/booking` now restores Status, When, Sort, and create-form Service from browser storage scoped to the signed-in user and bot. Stored values are validated; unavailable storage falls back to defaults. Booking row selections remain session-only so bulk actions do not carry over to a later visit.

**Verified:** `npm run typecheck` and targeted ESLint in `chatiq`; `git diff --check`. No browser or production smoke for this preference-only slice.

**Approx. toward DoD:** Track C **~98%**, unchanged (operator convenience polish).

```text
chatiq: Operator UI (Track C): [###################_] ~98% -> DoD
```

**Next:** After deploying ChatIQ, change the four dropdowns on a pilot bot, reload and revisit the page to confirm they restore; verify a different bot keeps its own choices. Continue the pending production delete check from the prior entry.

### 2026-10-27 — Verify staff hard-delete and show schedule progress

**Changed:** `booking.admin_delete` now runs before customer identity resolution, while retaining staff and confirmation checks. Supabase delete verifies one row was removed and a follow-up read finds no booking. ChatIQ schedule waits for a fresh list after deletion and shows an operation spinner/progress message for staff actions; network failures become visible errors. The bookings-list adapter typing was corrected so ChatIQ typecheck passes.

**Verified:** `npm run typecheck` in both repos; targeted ChatIQ ESLint; `node --check scripts/smoke-commands.mjs`; local `npm run smoke:commands` against the pilot Supabase project **PASS**, including delete of a cancelled booking followed by `BOOKING_NOT_FOUND` on a second delete. No production UI smoke or deployment in this session.

**Approx. toward DoD:** Track C **~98%**, unchanged (delete reliability and operator feedback polish).

```text
chatiq-booking + chatiq: Operator UI (Track C): [###################_] ~98% -> DoD
```

**Next:** Commit/push and deploy the sibling, then deploy ChatIQ; verify a single and bulk delete through `/dashboard/bots/[slug]/booking` and confirm removed IDs are absent from Supabase. Archive legacy dashboard code later.

### 2026-10-27 — Staff hard-delete + schedule status filter

**What changed**
- Sibling: `booking.admin_delete` (staff, `confirmed=true`, requires `booking_id`) + `deleteBooking` store helper; audit before/after; copilot heuristic + confirm gate.
- ChatIQ schedule: Status filter (Open / Cancelled & no-show / All); **Delete permanently**; cancel/no-show feedback earlier in session.
- Sibling `/admin` Schedule: **Delete permanently** on any selected booking.

**Verified:** typecheck/lints on edited TS (no full smoke this slice). Needs sibling deploy for delete on Vercel; ChatIQ UI works against new command once sibling is live.

**Approx. toward DoD:** Track C still **~98%** (ops polish, not checklist DoD).

```text
chatiq-booking + chatiq: Operator UI (Track C): [###################_] 98% -> DoD
```

**Next:** Deploy sibling; retest cancel/delete on schedule; optional commit/push both repos; legacy dashboard archive still open.

### 2026-10-26 — Docs sync + pause (roadmap / operator-ui spec)

**What changed (docs only)**
- Spec rewritten for shipped state + **how to open** (My Bots → Booking, not mode dropdown).
- ROADMAP §C, mission header, AGENTS, README, `_active-focus` aligned to ~98% paused.

**Approx. toward DoD:** Track C **~98%** (unchanged).

```text
chatiq: Operator UI (Track C): [###################_] 98% -> DoD
```

**Next session:** pilot smoke of ChatIQ Booking UI; or archive legacy dashboard code / Watch Phase B.

### 2026-10-26 — Track C slice 5: eligibility + closed dates in ChatIQ settings

**What changed**
- Settings → Resources: service eligibility checkboxes + person+room require toggle.
- Settings → Hours: add/list closed-date exceptions.

**Approx. toward DoD:** Track C **~98%**.

```text
chatiq: Operator UI (Track C): [###################_] 98% -> DoD
```

**Next:** archive legacy dashboard code when ready; optional time-block UI.

### 2026-10-26 — Track C slice 4: hide legacy Bookings + demote sibling `/admin`

**What changed**
- Sidebar: omit global Bookings when `BOOKING_RUNTIME=sibling`.
- `/dashboard/bookings/**` soft landing → My Bots / per-bot Booking.
- Overview snapshot CTA points at My Bots in sibling mode.
- Docs: sibling `/admin` = ops/pilot only (README + operator-ui + mission).

**Verified:** lint on edited layout/sidebar/env.

**Approx. toward DoD:** Track C **~95%** (superseded by slice 5).

**Next:** optional eligibility / exceptions / person+room linking UI in ChatIQ settings; later archive legacy `/dashboard/bookings` code.

### 2026-10-26 — Track C slice 3: ChatIQ booking settings panels

**What changed**
- `/dashboard/bots/[slug]/booking/settings`: Shapes (timezone + resources/stays), Services CRUD, weekly Hours, Resources CRUD.
- Shared `staff-client.ts` for schedule + settings.

**Verified:** lint clean on settings client.

**Approx. toward DoD:** Track C **~70%** (superseded by slice 4).

**Next:** hide legacy `/dashboard/bookings` nav; optional eligibility / exceptions polish; demote sibling `/admin`.

### 2026-10-26 — Track C slice 2: schedule reschedule / no-show / create-on-behalf

**What changed**
- ChatIQ schedule UI: select booking → reschedule slots, mark no-show, cancel; **Create booking** panel (list services → availability → create with guest identity).

**Verified:** typecheck/lint clean on edited client; commands reuse `/api/booking/staff/command`.

**Approx. toward DoD:** Track C **~45%** (superseded by slice 3).

**Next:** settings panels (services / hours / shapes / resources); then hide legacy `/dashboard/bookings`.

### 2026-10-26 — Track C slice 1: staff helper + schedule list/cancel

**What changed**
- ChatIQ: `executeBookingStaffCommand` / `resolveBookingStaffBotAccess`; `POST /api/booking/staff/command`; `GET /api/booking/staff/bookings`.
- UI: `/dashboard/bots/[slug]/booking` (list open bookings + cancel); settings placeholder; bot page **Booking** link.
- Unit: `tests/booking-sibling-staff.test.ts`.

**Verified:** unit tests for staff actor + ungated execute (no `booking_mode=full` required).

**Approx. toward DoD:** Track C **~25%** (superseded by slice 2).

**Next:** schedule mutations (reschedule / no-show / create-on-behalf); then settings panels (services/hours/shapes).

### 2026-10-26 — ChatIQ operator UI design locked (Track C)

**What changed (docs only)**
- New spec: [`chatiq-booking-operator-ui.md`](./chatiq-booking-operator-ui.md) — settings + schedule in ChatIQ; sibling remains engine; hide/delete legacy `/dashboard/bookings`.
- Workspace [`ROADMAP.md`](../../ROADMAP.md) §C; mission Resume points at Track C; Decisions row locked.

**Approx. toward DoD:** Track C **0%** impl (superseded by slice 1 above).

**Next:** implement ChatIQ server→sibling staff command helper; then schedule or settings page.

### 2026-10-26 — Multi-resource linking (person + room)

**What changed**
- Migration `20261026000002_resource_linking.sql`: `catalog_items.require_resource_kinds`, `booking_resources` (+ backfill).
- Availability/create assign one free resource per required kind; room busy blocks other clinicians at same time.
- Admin toggle on `/admin/resources`; command `resources.set_service_requirements`.
- Smoke: `npm run smoke:resource-linking`. Concierge `room_slug`.

**Verified:** typecheck; local smoke (this session).

**Next:** commit/push both repos; optional live chat smoke.

### 2026-10-26 — Stays shape v1

**What changed**
- Migration `20261026000001_stays_shape.sql`: `bookings.ends_at` (applied).
- Stay availability: check_in/check_out or nights + window; capacity = overlapping inventory per room-type catalog item.
- Create/reschedule path stores ends_at; shape gate `SHAPE_DISABLED` when stays off.
- Admin `/admin/stays`; smoke `npm run smoke:stays`.
- ChatIQ concierge: stay params on availability/create + hotel intent keywords.

**Verified:** typecheck; local smoke:stays (this session).

**Approx. toward DoD:**

```text
chatiq-booking: Shape modules (resources→stays): [####################] ~100% -> DoD
```

**Next:** deploy both apps; optional multi-resource linking or live hotel smoke.

### 2026-10-26 — Concierge resource tools (ChatIQ)

**What changed**
- ChatIQ concierge: `booking_get_bot_capabilities`, `booking_list_resources`; availability/create/reschedule accept `resource_preference` / `resource_slug`; policy asks anyone vs specific when resources enabled.
- Intent gate also matches clinician/therapist/doctor (EN/TH/ZH).

**Verified:** `vitest` `booking-sibling-concierge.test.ts` 15/15.

**Approx. toward DoD:** resources chat path complete; modules still ~50% until stays.

```text
chatiq: concierge resources: [####################] 100%
chatiq-booking: Shape modules (resources→stays): [##########__________] ~50% -> DoD
```

**Next:** begin **`stays`**, or live-smoke a resources-enabled pilot bot in chat.

### 2026-10-26 — Resources shape v1

**What changed**
- Migration `20261026000000_resources_shape.sql`: `resources`, `service_resources`, `bookings.resource_id` (applied to Supabase `crxwmkegmrusndpocntu`).
- Commands: `booking.get_bot_capabilities`, `availability.set_settings` (shapes), `resources.list|upsert|set_active|set_service_eligibility`; `get_availability` / `create` / `reschedule` honor any vs specific when `resources` enabled.
- Independent calendars per resource (A booked ≠ blocks B at same start).
- Admin `/admin/resources` (enable shape, CRUD, eligibility matrix).
- Smoke: `npm run smoke:resources`.

**Out of scope (later):** multi-resource linking (clinician + room together); `stays`.

**Verified:** `npm run typecheck`; local `npm run smoke:resources` all checks passed.

**Approx. toward DoD:**

```text
chatiq-booking: Base + appointments: [####################] 100%
chatiq-booking: Shape modules (resources→stays): [##########__________] ~50% -> DoD
```

**Next:** deploy booking sibling so Vercel matches; optional concierge resource slots; or begin **`stays`**.

### 2026-10-25 — Roadmap: base vs shape modules split

**What changed (docs only)**
- Workspace [`ROADMAP.md`](../../ROADMAP.md) and this Resume: **Track A** (base + appointments) marked complete; **Track B** (resources → stays) is default next.
- Shape-module work is explicitly separate from base polish (large-catalog prompts, Vercel flags, etc.).

**Approx. toward DoD:** Base/appointments v1 **done**; modules track **not started**.

```text
chatiq-booking: Base + appointments: [####################] 100%
chatiq-booking: Shape modules (resources→stays): [____________________] 0%
```

**Next session:** begin **`resources`** (clinic), or optional Track A polish if a real catalog needs search prompts first.

### 2026-10-25 — Phase 3b console slice 7 (staff-change customer notify)

**What changed**
- ChatIQ `POST /api/booking/admin-change-notify` + `notifyBookingAdminChange` (LINE push + web chat notice; EN/TH bilingual, zh when locale set).
- Booking sibling fires notify after staff cancel / reschedule / no-show / create-on-behalf (best-effort; derived from `BOOKING_CONNECT_URL_BASE` or `BOOKING_ADMIN_NOTIFY_URL`).
- User docs updated for notify-on-change.

**Verified:** typecheck both repos.

**Approx. toward DoD:** Phase 3b **~100%** (v1 admin doors).

```text
chatiq-booking: Phase 3b (admin console): [####################] ~100% -> DoD
```

**Next:** Later — large-catalog concierge prompts; resources / stays.

### 2026-10-25 — Phase 3b console slice 6 (admin copilot + user docs)

**What changed**
- `/admin/copilot`: propose API (OpenAI optional + heuristic fallback) → Confirm / Edit / Dismiss; executes with `via: "llm"`.
- User-facing ChatIQ docs updated: `booking-admin-and-teams.mdx`, `customer-identity-and-linking.mdx`, `ai-booking-assistant.mdx` reflect Schedule/Customers/Services/Hours/Commands/Audit/Copilot.

**Verified:** typecheck; propose API smoke (`list services`, `cancel <uuid>`).

**Approx. toward DoD:** Phase 3b **~95%** (customer notify-on-change remaining).

```text
chatiq-booking: Phase 3b (admin console): [###################_] ~95% -> DoD
```

**Next:** ChatIQ notify when staff mutates a booking; then Later resources/stays.

### 2026-10-25 — Phase 3b console slice 5 (mutation audit + actor scopes)

**What changed**
- Migration `command_audit_log`; every mutating command writes actor/via/before→after (tokens redacted).
- Customer scope: identity_claims required; `slots.contact_id` must match claim-resolved survivor (else `FORBIDDEN`).
- Staff/provider: team-wide on the bot calendar (provider isolation deferred to resources shape).
- `booking.admin_list_command_audit` + `/admin/audit` UI; admin actor sends `via: "ui"`.

**Verified:** typecheck; smoke:commands (scope + audit checks).

**Approx. toward DoD:** Phase 3b **~85%** (copilot remaining).

```text
chatiq-booking: Phase 3b (admin console): [#################___] ~85% -> DoD
```

**Next:** admin copilot (NL → confirm card → execute; customer notify).

### 2026-10-25 — Phase 3b console slice 4 (commands reference + ⌘K)

**What changed**
- Shared `command-catalog.ts` drives executable command set, `/admin/commands` reference (search/filter, slots, actor, mutate flag), and AdminShell ⌘K palette (pages + commands).
- Nav: Commands link; Schedule/Customers/etc. still primary doors.

**Verified:** typecheck.

**Approx. toward DoD:** Phase 3b **~70%**.

```text
chatiq-booking: Phase 3b (admin console): [##############______] ~70% -> DoD
```

**Next:** mutation audit + actor scopes; then admin copilot.

### 2026-10-25 — Phase 3b console slice 3 (customer identity + unmerge)

**What changed**
- Merges now write a reversible snapshot in `identity_audit_log.details` (moved bookings/sessions/bindings + deleted dupes).
- Commands: `booking.admin_list_identity_audit`, `booking.admin_unmerge` (staff, `confirmed=true`).
- `/admin/customers`: load by contact id (or Schedule “View customer →”); channel accounts, upcoming, audit table with Unmerge.
- `smoke-identity` extended for audit list + unmerge roundtrip.

**Verified:** typecheck + `npm run smoke:identity` (local).

**Approx. toward DoD:** Phase 3b **~55%**.

```text
chatiq-booking: Phase 3b (admin console): [###########_________] ~55% -> DoD
```

**Next:** commands reference page / ⌘K; then mutation audit + copilot.

### 2026-10-25 — Phase 3b console slice 2 (no-show + create-on-behalf)

**What changed**
- Migration `no_show` status; command `booking.mark_no_show` (staff; past OK).
- Schedule detail: Mark no-show; **New booking** panel (name/email/service → slots → create with `admin_created` claim + contact_profile).

**Approx. toward DoD:** Phase 3b **~40%**.

```text
chatiq-booking: Phase 3b (admin console): [########____________] ~40% -> DoD
```

**Next:** customer identity detail + unmerge, or commands reference page.

### 2026-10-25 — Phase 3b console slice 1 (Schedule calendar + actions)

**What changed**
- Deferred large-catalog concierge prompts to Later; marked Phase 3b.0 ✅.
- Admin booking list enriched (contact name/email, service title); status/from/to filters on API.
- `/admin` Schedule: Week calendar + Table views; detail panel with **Cancel** and **Reschedule** (offers slots via `get_availability`, confirms via `booking.reschedule`).

**Approx. toward DoD:** Phase 3b **~25%** (calendar/table + cancel/reschedule); remaining: create-on-behalf, no-show, commands reference, identity detail/unmerge, audit, copilot.

```text
chatiq-booking: Phase 3b (admin console): [#####_______________] ~25% -> DoD
```

**Next:** create-on-behalf / richer filters, or commands reference page.

### 2026-10-25 — Phase 3b.0 Services + Hours admin UI

**What changed**
- Shared admin shell: token + team/bot scope, nav Schedule / Services / Hours.
- `/admin/services` — add/edit, activate/deactivate, reorder; calls `catalog.*` + `booking.list_services` with `include_inactive` for staff.
- `/admin/hours` — weekly grid, closed dates, blocks; calls `availability.*`.
- Typecheck + production build ✅.

**Approx. toward DoD:** Phase 3b.0 **~90%** (concierge large-catalog prompt rules optional remaining).

```text
chatiq-booking: Phase 3b.0 (catalog/hours): [##################__] ~90% -> DoD
```

**Next:** optional concierge prompt rules for 9–100 services; else start Phase 3b calendar console.

### 2026-10-25 — Phase 3b.0 schema + commands (slice 1)

**What changed**
- Migration `20261025000001_catalog_and_hours.sql` applied: catalog additive columns, `bot_booking_settings`, hours/exceptions/blocks; dropped bot-wide unique start index (capacity-aware conflicts).
- Admin commands: `catalog.upsert_service|set_active|reorder`, `availability.set_hours|set_exception|block|unblock|get_schedule` (staff/system only).
- Customer: `booking.search_services`; `get_availability` uses weekly hours + exceptions + blocks + buffers/capacity/min notice.
- Smokes: `npm run smoke:catalog` **PASS**; `smoke:commands` updated for morning grid + **PASS**.

**Approx. toward DoD:** Phase 3b.0 **~55%** (schema/commands done; UI + concierge prompt rules left).

```text
chatiq-booking: Phase 3b.0 (catalog/hours): [###########_________] ~55% -> DoD
```

**Next:** `/admin` Services + Hours UI.

### 2026-10-25 — Phase 3a CLOSED

**Verified**
- Tripwire delivery: `npx tsx scripts/smoke-link-notify.ts` → `line: sent`, `web: sent` (forced path; pilot already linked).
- Identity smoke on Vercel: **PASS** including enrichment name/email before merge and survivor display fields after.
- Keepalive cron ping: user-confirmed OK with `CRON_SECRET`.

**Approx. toward DoD:** Phase 3a **100%**.

```text
chatiq-booking: Phase 3a (identity): [####################] 100% -> DoD
chatiq:         Phase 3a surfaces:   [####################] 100% -> DoD
```

**Next:** Phase 3b.0 — implement catalog + hours per [`service-catalog-and-availability.md`](./service-catalog-and-availability.md).

### 2026-10-25 — Contact enrichment + daily `"update"` keepalive

**What changed**
- Contract: optional `contact_profile` `{ name, email }` on turns + commands (both repos).
- Sibling: `enrichContactDisplay` fills blank/`Guest` on `contacts`; create path stores name/email; merge copies email onto survivor when missing.
- ChatIQ: passes LINE `line_display_name` (and peers) from `source_detail`; signed-in web email/name on chat + consent redeem.
- Smoke: `smoke-identity.mjs` asserts enrichment before/after merge.
- Ops: migration `20261025000000_update_keepalive.sql` → table `"update"`; `GET|POST /api/cron/update`; `vercel.json` daily `0 12 * * *`. Auth: `CRON_SECRET` (or service token).

**Verified:** typecheck (pending this session). Apply migration + set `CRON_SECRET` on booking Vercel before relying on cron.

**Approx. toward DoD:** Phase 3a **~98%**.

```text
chatiq-booking: Phase 3a (identity): [###################_] ~98% -> DoD
chatiq:         Phase 3a surfaces:   [###################_] ~98% -> DoD
```

**Next:** apply keepalive migration + deploy; live-verify tripwire on a fresh merge; then Phase 3b.0 catalog.

### 2026-10-25 — Both-channel link tripwire notifications built

**What changed**
- Sibling redeem returns `issuing_bot_id` for delivery targeting.
- ChatIQ `notifyBookingAccountsLinked`: after **fresh** merge (not `already_linked`), best-effort LINE push + web conversation assistant notice (“accounts were just linked… Wasn't you? Contact \<bot\>.”). Wired from consent redeem API + concierge redeem tool.
- Unit: `tests/booking-link-notifications.test.ts` message copy.

**Verify:** need a **fresh** merge (current pilot pair is already linked — tripwire skips). Use a second LINE/web pair or unmerge once Phase 3b exists.

**Approx. toward DoD:** Phase 3a **~96%**.

```text
chatiq-booking: Phase 3a (identity): [###################_] ~96% -> DoD
chatiq:         Phase 3a surfaces:   [###################_] ~96% -> DoD
```

**Next:** live-verify tripwire OR contact enrichment.

### 2026-10-25 — web→LINE short-code smoke PASS

**Verified (prod)**
- Already linked customer (LINE→web from 2026-10-24): web `/chat/chatiq-line-guide` issued code `915412` (+ connect URL unused for this direction).
- LINE OA redeem → “accounts are now linked” + **one upcoming** Consultation **Tue 27 Oct 2026 10:00 Asia/Bangkok**.

**Approx. toward DoD:** Phase 3a **~93%**.

```text
chatiq-booking: Phase 3a (identity): [###################_] ~93% -> DoD
```

**Next:** build both-channel “accounts linked” tripwire notifications; then contact enrichment.

### 2026-10-24 — Base + shape modules architecture locked (connectability)

**What changed (docs only — no runtime rewrite)**
- New locked spec: [`base-and-shape-modules.md`](./base-and-shape-modules.md) — one booking app; base (identity, command bus, catalog/hours primitives) + per-bot shapes (`appointments` → `resources` → `stays`); stable verbs with optional slots; additive columns (`resource_id`, `ends_at`); clinic ≠ 15 services; hotel ≠ 30 appointment services.
- **No fundamental code change required now.** Phase 3a / command bus stay. 3b.0 implements the `appointments` shape under these constraints (capacity / uniqueness must not block later resources).

**Approx. toward DoD:** Phase 3a still **~90%**; architecture clarity for post-3b growth **done**.

**Next session still:** web→LINE short-code smoke (not module loader, not catalog impl).

### 2026-10-24 — Service catalog & availability design locked (Phase 3b.0)

**What changed (docs only — no schema/UI)**
- New locked spec: [`service-catalog-and-availability.md`](./service-catalog-and-availability.md) — business-agnostic 1–100 services; shared calendar v1; hours/exceptions/blocks; admin `catalog.*` / `availability.*`; concierge `search_services` for large catalogs.
- Wired into mission Resume (step 4 = 3b.0 after 3a leftovers), Phase 3b.0 DoD, WS-H, Decisions table, docs README, command-library, workspace ROADMAP + AGENTS.

**Explicitly deferred:** migrations, admin UI, availability rewrite — finish Phase 3a (web→LINE, notifications, enrichment) first.

**Approx. toward DoD:** Phase 3a still **~90%** (unchanged); Phase 3b.0 design **done / impl 0%**.

```text
chatiq-booking: Phase 3a (identity):     [##################__] ~90% -> DoD
chatiq-booking: Phase 3b.0 (catalog):    [####________________] ~20% -> DoD (design only)
```

**Next session still:** web→LINE short-code smoke (not catalog impl).

### 2026-10-24 (EOD) — Live LINE↔web link works; post-merge web lookup PASS; handoff

**Verified today (prod)**
- LINE (`chatiq-line-guide`) booked Consultation **Tue 27 Oct 2026 10:00** Bangkok.
- Allowlist widened: `BOOKING_SIBLING_BOT_IDS=ed98722d-…,c967a5c0-…` (local + ChatIQ Vercel); LINE bot `booking_mode=full`.
- Consent link redeem PASS after cross-bot token fix (`chatiq-booking` `34b8d9b`): full URL token may redeem when request bot_id is allowlist[0] ≠ issuing bot.
- Post-merge web “do I have any bookings?” on https://www.chatiq.io/chat/chatiq-line-guide → **sees the LINE booking** after:
  - `chatiq` `b03fea75` — session `web_user` attached before bot lookup on dashboard chat
  - `chatiq-booking` `2a81fb3` — prefer `web_user`/`line` over `chatiq_conversation`; customer-scoped upcoming/`get_existing`

**Not done (tomorrow, in order)**
1. web→LINE short-code redemption smoke  
2. Build both-channel “accounts linked” notifications  
3. Contact enrichment  
4. Then Phase 3b.0 catalog/hours **implementation** (design already locked) → Phase 3b admin console  

**Approx. toward DoD:** Phase 3a **~90%**.

```text
chatiq-booking: Phase 3a (identity): [##################__] ~90% -> DoD
chatiq:         Phase 3a surfaces:   [##################__] ~90% -> DoD
```

**Tomorrow first action:** web→LINE — issue code on web (signed-in), redeem 6-digit code in LINE OA, confirm lookup both doors.

### 2026-10-24 — Post-merge web lookup miss: session userId never reached sibling

**What happened**
- Linked customer correct in DB (LINE + `web_user` cc875ce1… + booking Tue 10:00).
- Web `/chat/chatiq-line-guide` asked “do I have any bookings?” → none. Booking created orphan contact with **only** `chatiq_conversation` (no `web_user`).

**Cause:** `handle-chat-requests` set `botId` in an early `bot_slug` branch, then took `botId && !apiKey` and **skipped** the later `getUser()` that populated `userId` for sibling claims.

**Fix:** resolve `getUser()` before bot lookup (ChatIQ); prefer strong claims (`web_user`/`line`) over `chatiq_conversation` in `resolveOrCreateContact` (booking).

**Next:** deploy both → retest web “my booking” on [chatiq-line-guide chat](https://www.chatiq.io/chat/chatiq-line-guide).

### 2026-10-24 — LINE→web consent link PASS (live)

**Verified**
- Fresh LINE connect link → signed-in consent → **accounts linked**: bindings `web_user`, `chatiq_conversation`, `line`.
- Audit merge `e88e349f…`: survivor `8f94e5d6…`, LINE booking `6499b0ef…` Consultation **2026-10-27 10:00 Asia/Bangkok** re-pointed to survivor (`confirmed`).

**Display quirk (fixing):** consent summary said “0 upcoming” because `get_customer` filtered by allowlist[0] bot_id; booking is on LINE bot. Dropping bot filter on customer/upcoming + `get_existing` (team+contact).

**Approx. toward DoD:** Phase 3a **~85%**.

```text
chatiq-booking: Phase 3a (identity): [#################___] ~85%
```

**Next:** post-merge lookup from LINE + web; web→LINE short-code path; both-channel “accounts linked” notifications; contact enrichment.

### 2026-10-24 — LINE book ✅; consent redeem TOKEN_INVALID (cross-bot) fixed

**What happened**
- LINE (`chatiq-line-guide`) booked Consultation Tue 27 Oct 2026 10:00; concierge issued connect link + code `284432`.
- Consent page redeem showed `TOKEN_INVALID`: ChatIQ `/api/booking/connect/redeem` scopes with allowlist **[0]** (pilot bot) while the token was issued for the LINE bot; sibling required `token.bot_id === request.bot_id`.

**Fix (local; deploy booking sibling next)**
- `redeemConnectToken`: full URL token (hash) → team match only; short codes stay bot-scoped; merge uses token’s issuing `bot_id`.
- Smoke: cross-bot full-token redeem (issue on ALT_BOT, redeem on BOT).
- ChatIQ redeem route comment clarified (team from allowlist[0] is fine when pilots share a team).

**Approx. toward DoD:** Phase 3a **~80%** (channel smoke in progress; link blocked until sibling deploy).

```text
chatiq-booking: Phase 3a (identity): [################____] ~80%
```

**Next:** deploy `chatiq-booking` → re-ask LINE for a fresh link → consent redeem → then persistence + reverse link + notifications.

### 2026-10-24 — Consent page go-live verified (connect_url + signed-out CTA)

**Verified**
- Vercel env `BOOKING_CONNECT_URL_BASE=https://www.chatiq.io/booking/connect` live: `booking.create_connect_token` returns `connect_url` with that base + `?token=…`.
- `GET https://www.chatiq.io/booking/connect?token=…` → 200, **Sign in to continue** (signed-out). Missing-token URL shows “missing its code”.

**Approx. toward DoD:** Phase 3a **~80%**.

```text
chatiq-booking: Phase 3a (identity): [################____] ~80%
```

**Next:** LINE channel smokes (get bot id/OA) + both-channel notifications; contact enrichment; optional signed-in consent click-through.

### 2026-10-24 — Concierge linking live smoke PASS; sibling timeout raised

**Verified**
- Live linking smoke `CONCIERGE_LIVE_SMOKE=1 npx vitest run tests/booking-sibling-concierge-live.test.ts` → **1/1 PASS** (~35s): EN issues 6-digit code → TH consent → redeem with `confirmed=true` → survivor contact matches.
- Fixes along the way: dotenv `override: true` (stale shell key); duplicate `chatiq_conversation` claim on sibling (`1c27015`); client timeout 8s→20s (redeem ~11s on Vercel was aborting; LLM had misreported timeout as expired).

**Approx. toward DoD:** Phase 3a **~75%**.

```text
chatiq-booking: Phase 3a (identity): [###############_____] ~75%
chatiq:         Phase 3a surfaces:   [###############_____] ~75%
```

**Next:** consent page go-live — `BOOKING_CONNECT_URL_BASE` on chatiq-booking Vercel + e2e.

### 2026-10-23 (EOD) — Phase 3a steps 1/2/5 built; live smoke blocked on dead OpenAI key; EOD handoff

**Changed**
- **Step 1 — concierge linking conversation (`chatiq`)**: concierge gained tools `booking_create_connect_token` / `booking_redeem_connect_token` / `booking_get_customer` (adapter already passes any command through); system-prompt rules 10–12 (neutral offer only when another channel is mentioned, issue→instruct, one consent summary then MUST redeem same-turn, error mapping `TOKEN_INVALID/EXPIRED/USED`, **zero existence disclosure**, never look up by name/phone/email); deterministic gate in the tool loop — redeem with `confirmed !== true` is refused locally as `CONFIRMATION_REQUIRED` and never reaches the sibling. Unit tests: `tests/booking-sibling-concierge.test.ts` **12/12** (tool list, prompt rules, issue flow, gate blocks, redeem+get_customer merge flow); typecheck ✅.
- **Step 1 live harness (`chatiq`)**: `tests/booking-sibling-concierge-live.test.ts`, skipped unless `CONCIERGE_LIVE_SMOKE=1`. Drives two conversations against the deployed sibling: EN door asks to link → 6-digit code; TH door presents code → consent summary (Thai asserted) → confirms → merge; asserts TH door resolves to the EN door's (older) survivor contact; post-link EN check. Includes status-only fetch/gate diagnostics (no secrets logged).
- **Step 5 — expired-token smoke (`chatiq-booking`)**: `scripts/smoke-identity.mjs` now issues a token, backdates `expires_at` via Supabase REST (service key, hashed code lookup), and asserts redeem → `TOKEN_EXPIRED`. Placed before the real issue (issuing supersedes outstanding). Skips cleanly without Supabase env.
- **Step 2 — consent page (`chatiq`, user decision: ChatIQ-hosted, login-required)**: `src/app/(app)/booking/connect/page.tsx` (server: token check → signed-out card with sign-in CTA, or consent card; discloses nothing about the issuing account), `connect-form.tsx` (confirm/cancel, error copy per token code, post-merge own-summary: channels + upcoming count), `src/app/api/booking/connect/redeem/route.ts` (session required; pilot scope from `BOOKING_SIBLING_BOT_IDS` first entry + `bot_bots.team_id` via admin client; redeems with `web_user` claim `verified:true`, then `get_customer` summary). Sibling `BOOKING_CONNECT_URL_BASE=http://localhost:3000/booking/connect` set in local `chatiq-booking/.env.local`.

**Verified**
- `chatiq`: concierge unit tests **12/12**; `npm run typecheck` ✅ (twice, incl. consent page/API).
- `chatiq-booking`: `BOOKING_SMOKE_BASE_URL=https://chatiq-booking.vercel.app npm run smoke:identity` → **19/19 PASS** (3 new expiry checks included). Local run unavailable (sibling dev server not running; deployed is the same code).
- Live concierge harness reached OpenAI and got **401** — gates printed all-true (`concierge=true sibling=true botAllowed=true openaiKey=true`), so the only failure is the credential.

**Blockers / user actions**
- 🔑 `OPENAI_API_KEY` in `chatiq/.env.local` is rejected by OpenAI (**401**). Replace with a valid key → live linking smoke is one command (see Resume here). (Prod ChatIQ Vercel still has no `BOOKING_CONCIERGE`, so prod chat unaffected.)
- ▲ Add `BOOKING_CONNECT_URL_BASE=https://www.chatiq.io/booking/connect` to **chatiq-booking Vercel env** + redeploy for consent-page go-live.
- Consent page browser visual check was interrupted (IDE browser hung) — re-verify tomorrow; sign-in has no `next` param support, so post-login the customer re-opens the link (accepted pilot friction; step-up fresh-auth enforcement deferred).

**Approx. toward DoD:** Phase 3a **~70%** (sibling core + concierge + consent built & unit/deployed-smoke verified; live LLM smoke, channel smokes, notifications, enrichment left).

```text
chatiq-booking: Phase 3a (identity): [##############______] ~70%
chatiq:         Phase 3a surfaces:   [##############______] ~70%
```

**Next (tomorrow, in order):** (1) valid OpenAI key → run live linking smoke; (2) Vercel env for connect URL → consent e2e; (3) LINE channel smokes + build both-channel "accounts linked" notifications; (4) contact enrichment. Then Phase 3b admin doors.

### 2026-10-23 — Phase 3a sibling core pushed + deployed smokes green

**Shipped**
- `chatiq-booking` `a7248f4` `Add identity linking: connect tokens and contact merge (Phase 3a)` — pushed to `main`.
- `chatiq` `0c460fba` `Add human docs for booking assistant, identity, and admins` — pushed to `main`.

**Verified (deployed, Vercel prod)**
- `BOOKING_SMOKE_BASE_URL=https://chatiq-booking.vercel.app npm run smoke:identity` → **PASS** (all 16 checks on prod).
- Same base `npm run smoke:commands` → **PASS** (booking lifecycle regression on prod).

**Approx. toward DoD:** Phase 3a **~60%** (sibling core done + deployed-proven; channel smokes + concierge/admin surfaces + enrichment left).

```text
chatiq-booking: Phase 3a (identity): [############________] ~60%
```

**Next:** channel smokes need a LINE-connected bot (LINE identity persistence first); concierge linking conversation (offer + code redemption, no existence disclosure, EN/TH); contact enrichment (LINE display name, web profile at redemption); connect consent page (web UI for redemption URL); expired-token smoke variant (backdated token).

### 2026-10-23 — Phase 3a sibling core built + identity smoke 16/16

**Changed**
- Migration `20261023000000_identity_linking.sql` applied via Supabase CLI (`db push`, project linked): `connect_tokens`, `identity_audit_log`, `contacts.merged_into/merged_at`.
- `src/lib/supabase/identity.ts`: connect-token issue (SHA-256 hashes, one-time, 10-min, supersedes outstanding), redeem (long token or 6-digit code; `TOKEN_INVALID/USED/EXPIRED`), deterministic `mergeContacts` (web-profile survivor else older; bookings/sessions/bindings re-pointed; tombstone; audit; `MERGE_CONFLICT` abort), `getCustomerProfile` (follows merges).
- Commands: `booking.create_connect_token`, `booking.redeem_connect_token`, `booking.get_customer` on `/api/v1/commands/execute`; contract updated.
- Fix during smoke: short-code reuse now reports `TOKEN_USED` (lookup keeps consumed token visible, prefers a live one on collision).
- Human docs in `chatiq`: `/docs/ai-booking-assistant`, `/docs/customer-identity-and-linking`, `/docs/booking-admin-and-teams` (+ docs index Booking category). MDX compile ✅; visible after ChatIQ dev restart.

**Verified**
- `npm run smoke:identity` (local server, real Supabase): **16/16** — two doors book separately, pre-link isolation, wrong code, token issue/expiry, redeem merge, reuse rejected, both doors resolve to survivor with both bindings, merged customer sees both bookings, `get_existing` from LINE door. Cleanup cancelled smoke bookings.
- Regression: `npm run smoke:commands` still **PASS**; typecheck + build ✅.

**Approx. toward DoD:** Phase 3a **~55%** (sibling core done; channel smokes + concierge/admin surfaces + enrichment left).

```text
chatiq-booking: Phase 3a (identity): [###########_________] ~55%
```

**Next:** push/deploy → deployed identity smoke; then channel smokes need a LINE-connected bot (LINE persistence first); concierge linking conversation; contact enrichment.

### 2026-10-21 — EOD handoff: identity (Phase 3a) designed & documented; pickup tomorrow

**Discussed & locked (with user; no code today)**
- Every channel account (web login / LINE user ID) is a legitimate first-class customer account; bookings belong to the **customer**, channel accounts are keys. Linking is additive.
- Merge only on **proof of control of both accounts** in one ceremony (industry-standard account linking): one-time hashed token (10-min), fresh login at redemption, explicit consent screen, merge → notify **both** channels. **Never** merge on claimed name/phone/email; no existence disclosure pre-merge.
- Deterministic sibling owns token/merge/audit; LLM/concierge guides; staff trigger but never bypass proof; unmerge is admin-only.
- Full spec: [`identity-and-account-linking.md`](./identity-and-account-linking.md) (principles, honest current-status table, ceremony, merge semantics, commands, exit tests, deferred items).

**Doc changes**
- Mission: Resume-here now starts at **Phase 3a**; DoD split Phase 3 → **3a Identity** + **3b Admin doors**; WS-C rewritten as Phase 3a checklist; identity added to locked decisions.
- Design doc [`booking-command-library.md`](./booking-command-library.md): identity section + commands.
- Workspace `ROADMAP.md` / `AGENTS.md` and `chatiq/dev_docs/_active-focus.md` repointed to Phase 3a.

**State at EOD:** Phase 1 ✅, Phase 2 ✅ (concierge committed `db327c43` / `98140fc`, live-smoked EN/TH/ZH). Phase 3a **0% built, 100% specified**.

```text
chatiq-booking: Phase 3a (identity):  [____________________] 0% built -> DoD (spec complete)
chatiq:         Phase 3a support:     [____________________] 0% (LINE smoke + consent surface later)
```

**Tomorrow first action:** Phase 3a step 1 — Supabase migration (`connect_tokens`, `identity_audit_log`, `contacts.merged_into`) in `chatiq-booking`, then token/merge commands. Prereq check: a LINE-connected bot is needed for the LINE smokes later in 3a (API exit tests need no LINE).

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

### 2026-10-21 — Phase 2 smoke ✅ (EN/TH/ZH) — Phase 2 DONE

**Live smoke (pilot bot, local ChatIQ → Vercel sibling; all DB-verified)**
- EN: cancel-with-confirmation (after fix below), conversational narrowing service→this/next week→day→morning→booked Thu 22 Oct 10:00 (`f00b5413`, later cancelled in TH flow); one-shot "Thursday morning" respected.
- TH: lookup + cancel in Thai; `ใช่` executed first try; post-cancel lookup correct.
- ZH: "下个月" narrowed inside November; first-Friday-morning → Fri 6 Nov 10:00 booked (`ef81b867` confirmed); ZH lookup answered about it.
- Only sibling-returned slots were ever offered.

**Issues found in smoke → fixed same day**
1. **Confirmation loop**: LLM re-asked "confirm yes" instead of executing. Fix: prompt rule — an affirmative reply to its own confirmation question must execute same-turn (`confirmed=true`); verified by tool log + DB.
2. **Presumptive rebook offer** after cancel. Fix: rule 9 — offer rebook only if intent expressed earlier; otherwise neutral close.
3. **Slot-dump before narrowing**. Fix: rule 2 — narrow conversationally first (week→day→time-of-day), search only with a day/window or "soonest"; summarize day-part availability before exact times.
4. **Language lag on mid-thread switch** (TH history anchored replies). Prompt fix alone insufficient (log proved model still drafted Thai). Fix: script-based latest-message detection (`Reply ONLY in …`) **plus deterministic reply-language enforcement** — reply script mismatch → rewrite before delivery. Log line `reply language mismatch (want Chinese); rewriting` confirmed firing; ZH reply then delivered.
5. Replies now report `response_source: "llm"` (was misleadingly "deterministic").

**Phase 2 DoD met.** Remaining: nothing for P2. Next: Phase 3 admin doors (WS-H).

```text
chatiq: Phase 2 (LLM concierge): [####################] 100%
```

### 2026-10-21 — Phase 2 built: LLM concierge in ChatIQ (awaiting live smoke)

**Changed (`chatiq`)**
- `src/lib/booking-sibling/concierge.ts`: OpenAI tool loop (model `gpt-4.1-mini`, `BOOKING_CONCIERGE_MODEL` override) with 6 tools mapped to sibling commands; policy prompt (today/tz injected, reply in customer's language, never invent slots, confirm before mutate, ≤7-day narrowing windows).
- `adapter.ts`: `callBookingSiblingCommand` → `POST /api/v1/commands/execute`. `env.ts`: `BOOKING_CONCIERGE=llm` gate (default off).
- Chat wiring: concierge tried first on sibling-active bots; **any failure falls back to the deterministic sibling turn**. Telemetry `route_reason=concierge_turn_ok`, `booking_concierge=true`.
- Local env: `BOOKING_CONCIERGE=llm` appended to `chatiq/.env.local` (restart required).

**Verified**
- `tests/booking-sibling-concierge.test.ts` + sibling suites: **24/24 pass** (gates, prompt, tool loop, error-feedback, confirmation-error path). `npm run typecheck` ✅.

**Approx. toward DoD:** Phase 2 **~70%** — live EN/TH/ZH smoke outstanding.

```text
chatiq: Phase 2 (LLM concierge): [##############______] ~70%
```

**Next:** restart ChatIQ dev server → smoke pilot bot per Resume-here script (EN narrowing, TH, ZH, next-month, cancel-confirm) → mark DoD P2.

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

**Approx. toward DoD:** Phase 1 **~90%** at code-complete; **100% after deployed re-run (below)**.

```text
chatiq-booking: Phase 1 (tool-ready): [##################__] ~90%
```

**Deployed verification (2026-10-21, after push `452ce35`):** Vercel deployed; `BOOKING_SMOKE_BASE_URL=https://chatiq-booking.vercel.app npm run smoke:commands` → **20/20 PASS**. Phase 1 DoD met.

**Next:** Phase 2 LLM tool loop in `chatiq`.

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
