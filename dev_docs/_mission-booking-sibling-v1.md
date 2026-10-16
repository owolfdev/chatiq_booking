# Mission: Booking sibling v1 (`chatiq-booking`)

Last updated: 2026-10-17  
Status: **In progress** — skeleton scaffolded; mock persistence; ChatIQ adapter gated off by default.  
Owner: Engineering

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| **Shape** | Sibling Next.js app (`chatiq-booking/`), own git repo + Vercel project |
| **ChatIQ touch** | Thin HTTP adapter + `booking_mode` gate; no booking business logic in core chat |
| **DB** | New Supabase project when vertical slice needs persistence; skeleton = in-memory mock |
| **Timezone** | UTC storage later; pilot default **Asia/Bangkok** |
| **Contacts** | Booking-owned `contacts` + `identity_bindings`; connect-link for chat↔web login (later) |
| **Legacy** | Archive/tag old in-`chatiq` engine; mine docs, do not import runtime |

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

### WS-B — Vertical slice (next)

- [ ] Provision booking Supabase
- [ ] `contacts` + `identity_bindings` + sessions/bookings tables
- [ ] One catalog item + availability + create booking
- [ ] Minimal admin schedule view
- [ ] Wire adapter into chat turn path for opted-in pilot bot only

### WS-C — Identity (phased)

- [ ] Resolve by conversation/LINE binding
- [ ] Connect-link chat → web/app login
- [ ] Soft verified email/phone merge; admin merge

### WS-D — Archive legacy

- [ ] Inventory + git tag `pre-booking-sibling-archive`
- [ ] Remove old engine from hot paths; keep docs as legacy reference

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
