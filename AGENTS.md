<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Booking mission handoff (2026-10-27)

- Read [`dev_docs/_mission-booking-sibling-v1.md`](./dev_docs/_mission-booking-sibling-v1.md) **Resume here** and [`dev_docs/chatiq-booking-operator-ui.md`](./dev_docs/chatiq-booking-operator-ui.md) before booking operator work. Workspace priorities: [`../ROADMAP.md`](../ROADMAP.md) §C.
- This repo owns commands, booking rules, and Supabase persistence. `../chatiq/` owns the subscriber schedule/settings UI and its navigation.
- October 27 hard-delete implementation is pushed (`7b68459`) and passed local `npm run smoke:commands` against pilot Supabase. Production deploy revision, single/bulk delete through ChatIQ, saved filters, progress feedback, and links are **not yet verified** in the handoff. Do that pilot checklist first and log results in the mission.
- Keep the generated Next.js block above intact when editing this file.
