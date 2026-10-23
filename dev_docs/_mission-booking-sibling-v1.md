# Mission: Booking sibling v1 (`chatiq-booking`)

Last updated: 2026-10-24  
Status: **In progress** — **Phase 1 ✅ + Phase 2 ✅**. **Phase 3a ~75%**: sibling identity core ✅; concierge linking **live-smoked EN→TH** (2026-10-24); consent page built, go-live pending Vercel env. Then 3b admin doors. Design: [`booking-command-library.md`](./booking-command-library.md) · Identity spec: [`identity-and-account-linking.md`](./identity-and-account-linking.md).  
Owner: Engineering

## Resume here (next session)

**The one roadmap is this file (§2 DoD + §3 workstreams). Do this next, in order:**

1. ~~**Phase 1 — Tool-ready sibling**~~ ✅ **DONE 2026-10-21** (see WS-F; smoke 20/20 locally + on Vercel).
2. ~~**Phase 2 — LLM concierge**~~ ✅ **DONE 2026-10-21** (live-smoked EN/TH/ZH, see Progress Log). Enabled by `BOOKING_CONCIERGE=llm` (set in local `chatiq/.env.local`; add to Vercel env when deploying concierge to prod chat).
3. **Phase 3a — Identity & account linking** — sibling core ✅; concierge linking **live-smoked 2026-10-24** (`CONCIERGE_LIVE_SMOKE=1` → 1/1); ChatIQ consent page built. Full spec: [`identity-and-account-linking.md`](./identity-and-account-linking.md). **← CONTINUE HERE:**
   - **Consent page go-live (do this next):** add `BOOKING_CONNECT_URL_BASE=https://www.chatiq.io/booking/connect` to **chatiq-booking** Vercel Production env → redeploy → e2e with a signed-in ChatIQ user + fresh connect token. Local already has `http://localhost:3000/booking/connect`. Sign-in has no `next` param — reopen the link after login; step-up deferred.
   - **Channel smokes** (LINE-connected bot available — get bot id/OA first): LINE persistence → LINE→web via consent page → web→LINE code in chat → post-merge both-door lookup. **Not yet built:** both-channel "accounts linked" notifications.
   - **Contact enrichment**: LINE display name; web name/email at consent redemption.
   - After booking pushes: `BOOKING_SMOKE_BASE_URL=https://chatiq-booking.vercel.app npm run smoke:identity` (+ `smoke:commands`).
4. **Phase 3b — Admin doors**: console (calendar/table, command buttons, ⌘K, commands reference, audit incl. identity audit + unmerge) → copilot with confirm-cards. See DoD Phase 3b.
5. Parallel/later — widen `BOOKING_SIBLING_BOT_IDS` per added bot (smoke each); WS-D code archive of legacy engine (docs already archived 2026-10-21); payments; add `BOOKING_CONCIERGE=llm` to ChatIQ Vercel env when concierge goes to prod.

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
| **Contacts** | Booking-owned `contacts` + `identity_bindings`; connect-link in Phase 3a |
| **Identity (locked 2026-10-21)** | **Every channel account (web login, LINE user ID) is a legitimate first-class customer account; bookings belong to the customer, channel accounts are keys. Merge only on proof of control of BOTH accounts in one ceremony (one-time token + consent + both-channel notification); never merge on claimed name/phone/email.** Spec: [`identity-and-account-linking.md`](./identity-and-account-linking.md) |
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

- [x] Booking tools registered only for `booking_mode=full` + allowlisted bots (+ `BOOKING_CONCIERGE=llm`); sibling remains unreachable otherwise
- [x] Policy prompt live: never invent slots/services; confirm before mutating; reply in customer's language; today + timezone injected
- [x] Narrowing implemented: service → week → day → time-of-day, skipping already-stated info; ≤ 3 slots offered; "more" re-queries next window (live verification in smoke below)
- [x] Smoke passes (pilot bot) 2026-10-21: EN conversational narrowing (service→week→day→morning→booked, DB-verified); TH lookup + cancel (`ใช่` executed first try); ZH next-month create (Fri 6 Nov 10:00 confirmed) + lookup; cancel confirmation enforced; mid-thread language switch enforced (script detection + rewrite)
- [x] Fail-closed preserved: concierge failure → deterministic sibling turn; sibling down → no booking action, core chat continues

### Phase 3a — Identity & account linking (LINE ↔ web) — NEXT

Spec: [`identity-and-account-linking.md`](./identity-and-account-linking.md). Done when **a customer who booked at one door is recognized at the other after a secure link**:

- [x] Migration: `connect_tokens` (hashed, one-time, 10-min), `identity_audit_log`, `contacts.merged_into`/status — applied 2026-10-23 via Supabase CLI (`db push`)
- [x] `booking.create_connect_token` / `booking.redeem_connect_token` / `booking.get_customer`; merge is internal-only, deterministic survivor rule, tombstone + audit, `MERGE_CONFLICT` aborts safely
- [x] API exit tests (no LLM): `npm run smoke:identity` **19/19 on Vercel** — happy-path merge unifies bookings from both sides; wrong code `TOKEN_INVALID`; reuse `TOKEN_USED`; expired (backdated) code `TOKEN_EXPIRED` (2026-10-23)
- [ ] Channel smokes: LINE persistence (new conversation finds booking); LINE→web link (consent screen, fresh login); web→LINE short-code redemption in chat; post-merge lookup from **both** doors; both-channel "accounts linked" notification (notification not yet built)
- [x] Concierge linking conversation built + **live EN→TH smoke PASS 2026-10-24** (`chatiq/tests/booking-sibling-concierge-live.test.ts`; unit 12/12; sibling timeout raised for merge)
- [x] Consent page built, **ChatIQ-hosted + login-required** (decision 2026-10-23): `chatiq` `/booking/connect` + `/api/booking/connect/redeem` (session = web-door proof; `web_user` claim `verified:true`). Go-live pending `BOOKING_CONNECT_URL_BASE` in chatiq-booking Vercel env + e2e verify
- [ ] Contact enrichment: LINE display-name snapshot; web name/email copied at redemption (display only)

### Phase 3b — Admin doors (same command bus)

Done when **human agents can run the same operations directly and via natural language, with accountability**:

- [ ] `/admin` console: calendar + table views, booking detail with command buttons (reschedule/cancel/no-show/create-on-behalf), filters; customer detail shows channel accounts + identity audit, with admin unmerge
- [ ] Commands reference page + ⌘K palette listing every command, inputs, and who may run it
- [ ] Actor scope enforced (customer=own, provider=own calendar, agent=team) and every mutation audit-logged (actor, via UI/LLM, before→after)
- [ ] Admin copilot: NL → proposed command card → human Confirm/Edit/Dismiss; read-only NL queries answered from command results; admin changes notify the customer in their language via ChatIQ

### Overall v1 DoD

Phases 1–2 complete on the pilot bot + Phase 3a identity + Phase 3b console (copilot may trail). Legacy in-`chatiq` booking docs archived (done 2026-10-21); legacy code tagged `pre-booking-sibling-archive` and off hot paths (WS-D).

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

- [x] Resolve by conversation/LINE binding (claims → contact; LINE path untested on real LINE bot)
- [x] Migration: `connect_tokens`, `identity_audit_log`, `contacts.merged_into` (applied 2026-10-23)
- [x] Connect token issue/redeem + internal merge (survivor rule, tombstone, audit, conflict abort)
- [x] `booking.get_customer`; contact enrichment (LINE display name, web profile at redemption) ← enrichment pending
- [x] API exit tests: `scripts/smoke-identity.mjs` **19/19 on Vercel** incl. backdated-token `TOKEN_EXPIRED` (2026-10-23; commands smoke still green)
- [x] Concierge linking conversation: identity tools + prompt + consent gate; unit 12/12; **live EN→TH smoke PASS 2026-10-24** (`CONCIERGE_LIVE_SMOKE=1`)
- [x] Consent page (ChatIQ-hosted, login-required per user decision 2026-10-23): `chatiq/src/app/(app)/booking/connect/` + `src/app/api/booking/connect/redeem/`; sibling `BOOKING_CONNECT_URL_BASE` set locally. Pending: Vercel env (`https://www.chatiq.io/booking/connect`) + e2e verify
- [ ] Channel smokes: LINE persistence; LINE→web; web→LINE code; post-merge both-door lookup + **both-channel notifications (not built yet)**; admin unmerge lands in WS-H

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

### WS-H — Phase 3b: admin doors

- [ ] `/admin` console: calendar/table, detail command buttons, filters; customer detail (channel accounts, identity audit, unmerge)
- [ ] Commands reference + ⌘K palette; actor scopes; audit log
- [ ] Copilot: NL → confirm-card → execute; customer notification on admin changes

## 4) Progress Log

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
