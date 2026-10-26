# chatiq-booking docs

**Start here — the only active booking roadmap in the workspace:**

**2026-10-27 handoff:** Track C operator UI is ~98% implemented; local hard-delete smoke passed and both repos' October 27 changes are pushed. Production deployment/browser verification is the first next action. Use the mission's **Resume here** checklist; do not treat the push as proof of a successful pilot run.

| Doc | Role |
|-----|------|
| [`_mission-booking-sibling-v1.md`](./_mission-booking-sibling-v1.md) | **Primary mission: current pilot checklist, DoD (Tracks A/B/C), Resume here, Progress Log** |
| [`booking-command-library.md`](./booking-command-library.md) | **Locked design (2026-10-21): LLM concierge → deterministic commands; tool catalog; narrowing; admin doors** |
| [`identity-and-account-linking.md`](./identity-and-account-linking.md) | **Phase 3a spec (locked 2026-10-21): channel accounts, LINE ↔ web linking ceremony, merge semantics, security rules** |
| [`service-catalog-and-availability.md`](./service-catalog-and-availability.md) | **Phase 3b.0 spec (locked 2026-10-24): owner-configured services + hours; 1–100 services; shared calendar v1** |
| [`base-and-shape-modules.md`](./base-and-shape-modules.md) | **Architecture (locked 2026-10-24): one sibling = base + optional shapes (appointments / resources / stays)** |
| [`chatiq-booking-operator-ui.md`](./chatiq-booking-operator-ui.md) | **Track C ~98% implemented: UI paths, staff API, delete/progress/preferences, navigation, release check; sibling = engine / `/admin` ops-only** |
| [`api-contract-v0.md`](./api-contract-v0.md) | Current v0 turn + health HTTP contract (pilot; v1 commands API planned in Phase 1) |
| [`supabase-setup.md`](./supabase-setup.md) | Supabase provisioning/migrations |

Legacy in-`chatiq` booking docs are **archived and superseded** — do not follow them:
`chatiq/dev_docs/booking-system/_archive/2026-legacy-engine/` (index: `chatiq/dev_docs/booking-system/README.md`).
