# What’s next — `chatiq-booking`

Last updated: 2026-10-28

**Start here for this repo.** Mission handoff (Resume / Progress Log): [`dev_docs/_mission-booking-sibling-v1.md`](./dev_docs/_mission-booking-sibling-v1.md). Operator UI spec: [`dev_docs/chatiq-booking-operator-ui.md`](./dev_docs/chatiq-booking-operator-ui.md).

Workspace-wide index (not in git): [`../ROADMAP.md`](../ROADMAP.md). ChatIQ-side booking UI next steps: [`../chatiq/ROADMAP.md`](../chatiq/ROADMAP.md).

Deployed: [chatiq-booking.vercel.app](https://chatiq-booking.vercel.app/) · ChatIQ adapter gated (`BOOKING_RUNTIME=sibling`).

One sibling app = **base** + optional **shape modules** (not one app per industry). Spec: [`dev_docs/base-and-shape-modules.md`](./dev_docs/base-and-shape-modules.md).

## A — Base + appointments shape — ✅ DONE (2026-10-25)

| Status | Item |
|--------|------|
| Done | Scaffold, adapter, Vercel, Supabase, commands API, LLM concierge (EN/TH/ZH); booking intent gated so general chat stays on the normal bot |
| Done — Phase 3a | Connect tokens, merge, both-direction links, tripwire, enrichment, keepalive cron |
| Done — Phase 3b.0 | Catalog/hours + Services & Hours admin UI |
| Done — Phase 3b | Schedule, Customers/unmerge, Commands/⌘K, Audit/scopes, Copilot confirm-cards, staff-change → customer notify |

**Optional base polish (not blocking modules):** large-catalog concierge prompts; widen `BOOKING_SIBLING_BOT_IDS`; `BOOKING_CONCIERGE=llm` on ChatIQ Vercel; payments.

## B — Shape modules — core three ✅

| Order | Shape | Status | Notes |
|-------|--------|--------|--------|
| 1 | **`appointments`** | ✅ Live (default) | What base polish above still improves |
| 2 | **`resources`** | ✅ v1 (2026-10-26) | Concierge any/specific; person+room linking; sibling `/admin/resources` |
| 3 | **`stays`** | ✅ v1 (2026-10-26) | Night ranges; room-type capacity; `/admin/stays`; concierge check-in/out |

**Done extra:** multi-resource linking (person + room; 2026-10-26).

## C — ChatIQ operator UI — ~98% shipped; production ✅ (2026-10-28)

Product surface for subscribers lives in **ChatIQ** (team auth). This repo stays the engine (commands API + Supabase). Spec: [`dev_docs/chatiq-booking-operator-ui.md`](./dev_docs/chatiq-booking-operator-ui.md).

**Open UI (in ChatIQ):** My Bots → **Booking** · `/dashboard/bots/[slug]/booking` · `/settings`

| Order | Item | Status | Notes |
|-------|------|--------|--------|
| 1 | Per-bot **settings** in ChatIQ | ✅ | Shapes, services, hours + closed dates, resources, eligibility / person+room |
| 2 | Per-bot **schedule** in ChatIQ | ✅ | List + filters, cancel / reschedule / no-show / create / hard-delete |
| 3 | Hide legacy `/dashboard/bookings` | ✅ | Soft landing when sibling runtime |
| 4 | Delete/archive legacy booking dashboard | ✅ | Soft landing in `chatiq` (2026-10-28); see [`../chatiq/ROADMAP.md`](../chatiq/ROADMAP.md) |
| 5 | Demote sibling `/admin` to ops-only | ✅ | Docs + AdminShell banner |
| 6 | Pilot production verification | ✅ | Operator confirmed booking works in production (2026-10-28) |

**Logged HEADs (2026-10-28):** this repo `3bad3a9` (includes delete fix `7b68459`); `chatiq` `4432967a` (includes `f40ede42` / `62ea7790`).

## Next (this engine)

Optional: payments, large-catalog prompts, time-blocks / customers-audit APIs if ChatIQ needs them. Default product next after Track C is often **Watch Phase B** or **core chat** — see workspace index / those repos’ `ROADMAP.md`.

## Design refs

- [`dev_docs/booking-command-library.md`](./dev_docs/booking-command-library.md)
- [`dev_docs/identity-and-account-linking.md`](./dev_docs/identity-and-account-linking.md)
- [`dev_docs/service-catalog-and-availability.md`](./dev_docs/service-catalog-and-availability.md)
- [`dev_docs/base-and-shape-modules.md`](./dev_docs/base-and-shape-modules.md)
