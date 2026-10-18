# Mission: Booking sibling v1 (`chatiq-booking`)

Last updated: 2026-10-18  
Status: **In progress** — deployed to Vercel (mock persistence); ChatIQ prod/local not yet pointed at sibling for a pilot bot.  
Owner: Engineering

## Resume here (next session — production pilot path)

**Do this next, in order:**

1. **Credentials on ChatIQ** — In `chatiq` `.env.local` (and Vercel when testing prod chat), set:
   ```bash
   BOOKING_RUNTIME=sibling
   BOOKING_SIBLING_URL=https://chatiq-booking.vercel.app
   BOOKING_SIBLING_TOKEN=<same value as BOOKING_SERVICE_TOKEN on chatiq-booking>
   BOOKING_SIBLING_BOT_IDS=<pilot-bot-uuid>
   ```
   Restart ChatIQ after env changes. Do **not** commit secrets.
2. **Identify or create a pilot bot** — Pilot slug: **`booking-system-test-bot`**. Set **Booking** mode to `full`. Copy Bot ID from bot settings (Bot Details) into `BOOKING_SIBLING_BOT_IDS` (allowlist keeps other bots off the sibling).
3. **Smoke / test toward DoD** — Chat the pilot bot (web or channel); expect the stub booking reply from the sibling. Confirm fail-closed if sibling is down. Then continue DoD: wire Supabase (project already provisioned), schema, first bookable happy-path, minimal admin.
4. **After pilot works** — Vertical slice on real DB; later clear/widen allowlist for release; archive legacy engine when ready.

**Already done (do not redo):**
- Sibling app live: https://chatiq-booking.vercel.app/ — `GET /api/health` returns `ok` (`persistence: mock`).
- Supabase project provisioned (ref `crxwmkegmrusndpocntu`); keys belong in `chatiq-booking` `.env.local` / Vercel (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`). **Not wired in code yet** — still mock.
- Chat path adapter in `chatiq` (`booking-sibling/`) committed + pushed; gated off unless env + `booking_mode=full` + allowlist.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| **Shape** | Sibling Next.js app (`chatiq-booking/`), own git repo + Vercel project |
| **ChatIQ touch** | Thin HTTP adapter + `booking_mode` gate; no booking business logic in core chat |
| **Deploy** | https://chatiq-booking.vercel.app/ |
| **DB** | Dedicated Supabase project `crxwmkegmrusndpocntu` (keys in env; app still mock until wired) |
| **Timezone** | UTC storage later; pilot default **Asia/Bangkok** |
| **Contacts** | Booking-owned `contacts` + `identity_bindings`; connect-link for chat↔web login (later) |
| **Legacy** | Archive/tag old in-`chatiq` engine; mine docs, do not import runtime |
| **Rollout** | `BOOKING_SIBLING_BOT_IDS` allowlist for pilot; widen/clear when releasing sibling to more bots |
| **Entry UX** | **Intent → typed command library** (not keyword canned as primary). Keywords/buttons = shortcuts to the same commands. Spec: [`booking-command-library.md`](./booking-command-library.md) |

## 1) Why

In-process booking in `chatiq` coupled core chat to a large engine. Extract to a sibling so trial-and-error cannot regress chat.

## 2) Definition of Done (v1 skeleton → pilot)

1. **Isolation** — Booking deploys cannot break core chat; `booking_mode=off` → zero sibling calls.
2. **Contract** — Health + turn handle v0 documented and implemented (mock).
3. **Adapter** — ChatIQ calls sibling only when `BOOKING_RUNTIME=sibling` + URL/token + `booking_mode=full`; fail closed on error/timeout.
4. **Pilot slice** — One bookable happy-path + minimal admin (after Supabase).
5. **Legacy** — Old engine tagged/archived off hot paths when sibling path is ready for a pilot bot.

## 3) Workstreams

### WS-A — Scaffold

- [x] Next.js app on port **3003**
- [x] `GET /api/health`, stub `POST /api/v1/turns/handle`
- [x] Env example + service token auth
- [x] Mission + API contract docs
- [x] Thin gated adapter in `chatiq` (`booking-sibling/`)
- [x] Deploy sibling to Vercel (`chatiq-booking.vercel.app`)

### WS-B — Vertical slice (next)

- [x] Wire adapter into chat turn path for opted-in pilot bot (`BOOKING_SIBLING_BOT_IDS`)
- [ ] **Pilot env on ChatIQ** — sibling URL/token + allowlisted bot + `booking_mode=full`; confirm stub in chat
- [x] Provision booking Supabase project (ref `crxwmkegmrusndpocntu`; keys in env only)
- [ ] Wire Supabase client in `chatiq-booking` (leave mock until this lands)
- [ ] `contacts` + `identity_bindings` + sessions/bookings tables
- [ ] One catalog item + availability + create booking
- [ ] Minimal admin schedule view

### WS-C — Identity (phased)

- [ ] Resolve by conversation/LINE binding
- [ ] Connect-link chat → web/app login
- [ ] Soft verified email/phone merge; admin merge

### WS-D — Archive legacy

- [ ] Inventory + git tag `pre-booking-sibling-archive`
- [ ] Remove old engine from hot paths; keep docs as legacy reference

### WS-E — Intent → command library (spec locked; implement after pilot smoke)

- [x] Spec + roadmap: [`booking-command-library.md`](./booking-command-library.md)
- [ ] Extend turn/command API with `command` + `slots` (contract bump)
- [ ] Implement `booking.create` (+ `booking.clarify`) on sibling
- [ ] ChatIQ: select command from catalog on inferred speech act; fail closed / clarify when ambiguous
- [ ] Map optional canned/buttons to same command IDs (demote keyword-as-owner)
- [ ] Then `booking.lookup` / reschedule / cancel

## 4) Progress Log

### 2026-10-17 — Skeleton scaffold

**Changed**
- Created `chatiq-booking/` Next.js sibling (health + mock turn API, in-memory contacts/sessions).
- Added `chatiq/src/lib/booking-sibling/` HTTP adapter (double-gated; fail closed).
- Documented API contract v0 and this mission.

**Verified**
- `npm install` + `npm run typecheck` in `chatiq-booking` (and adapter unit test in `chatiq` when run).

**Approx. toward DoD:** **~20%** (scaffold + contract + adapter; no real booking yet).

```text
chatiq-booking: [####________________] ~20% -> DoD
chatiq:         [##__________________] ~10% -> adapter only (legacy engine still present)
```

**Next**
1. Smoke the stub locally (`npm run dev` on 3003; curl health + turn).
2. Optional: wire adapter call site behind `BOOKING_RUNTIME=sibling` for one test bot.
3. When ready for persistence: new Supabase + first vertical slice.

### 2026-10-17 — Chat path wire-up

**Changed**
- `handle-chat-requests` calls sibling when `BOOKING_RUNTIME=sibling` + URL/token + `booking_mode=full` + optional bot allowlist; legacy engine skipped for that bot.
- Mock sessions reused per conversation; fail closed → core chat.

**Verified**
- Adapter/allowlist unit tests (`vitest` booking-sibling-adapter: 9 passed).
- Local API smoke on `:3003`: `GET /api/health` ok; two `POST /api/v1/turns/handle` turns reused `ses_mock_1` for same `conversation_id`.
- `chatiq-booking` `npm run typecheck` + `npm run build` ok.

**Approx. toward DoD:** **~35%**.

```text
chatiq-booking: [#######_____________] ~35% -> DoD
chatiq:         [######______________] ~30% -> sibling chat wire (pilot env)
```

**Next**
1. Optional UI pilot: set `BOOKING_RUNTIME=sibling` + `BOOKING_SIBLING_*` in `chatiq` `.env.local`, one bot `booking_mode=full` + allowlist UUID; confirm stub reply in web chat.
2. Provision booking Supabase + first vertical slice (catalog item, availability, create booking).
3. Minimal admin schedule view.

### 2026-10-17 — Deploy + Supabase provisioned (session end)

**Changed / ops**
- Sibling pushed and deployed: https://chatiq-booking.vercel.app/ (health ok; still `persistence: mock`).
- Dedicated Supabase project created (ref `crxwmkegmrusndpocntu`); publishable/secret keys stored in booking env (local ± Vercel) — **code not using them yet**.
- Documented pilot rollout: ChatIQ credentials → pilot bot allowlist → stub smoke → DoD (schema + real booking + tests).

**Verified**
- Production `GET /api/health` → `ok: true`, `contract_version: "0"`, `persistence: "mock"`.

**Approx. toward DoD:** **~40%** (deploy + DB project exist; pilot ChatIQ env + real persistence still open).

```text
chatiq-booking: [########____________] ~40% -> DoD
chatiq:         [######______________] ~30% -> needs pilot env + bot smoke
```

**Next (canonical — see “Resume here” above)**
1. Add sibling credentials to ChatIQ (`BOOKING_RUNTIME` / `BOOKING_SIBLING_*`).
2. Identify/create pilot bot (`booking_mode=full` + UUID in allowlist).
3. Test stub path; then wire Supabase and continue DoD.

### 2026-10-18 — Intent → command library (spec)

**Changed**
- Locked product decision: booking entry via **inferred speech act + typed command catalog**, not keyword canned as primary ownership.
- Added [`booking-command-library.md`](./booking-command-library.md); noted planned `command`/`slots` on API contract; WS-E on this mission; roadmap row.

**Verified**
- Docs only.

**Approx. toward DoD:** **~40%** (unchanged on runtime; product direction clearer for post-pilot).

```text
chatiq-booking: [########____________] ~40% -> DoD
chatiq:         [######______________] ~30% -> needs pilot env + bot smoke
```

**Next**
1. Unchanged pilot path (credentials → bot → stub smoke).
2. After Supabase + `booking.create` slice: implement WS-E command selection.
