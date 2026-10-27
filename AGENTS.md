<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Booking mission handoff (2026-10-28)

- **What’s next (this repo):** [`ROADMAP.md`](./ROADMAP.md) — then [`dev_docs/_mission-booking-sibling-v1.md`](./dev_docs/_mission-booking-sibling-v1.md) **Resume here**.
- Spec: [`dev_docs/chatiq-booking-operator-ui.md`](./dev_docs/chatiq-booking-operator-ui.md).
- This repo owns commands, booking rules, and Supabase persistence. `../chatiq/` owns the subscriber schedule/settings UI ([`../chatiq/ROADMAP.md`](../chatiq/ROADMAP.md)).
- Track C production ✅ (operator confirmed 2026-10-28). Optional next: payments / catalog polish here; legacy Bookings archive in ChatIQ; or Watch / core chat.
- Keep the generated Next.js block above intact when editing this file.
