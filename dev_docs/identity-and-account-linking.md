# Identity & account linking (LINE ↔ web)

Last updated: 2026-10-21
Status: **Design locked (discussion 2026-10-21); not yet built.** This is **Phase 3a** — before admin doors (Phase 3b).
Mission: [`_mission-booking-sibling-v1.md`](./_mission-booking-sibling-v1.md) (Resume here, WS-C, DoD Phase 3a)
Design context: [`booking-command-library.md`](./booking-command-library.md)

## 1) Principles (locked)

1. **Every channel account is a legitimate, first-class customer account.**
   - A logged-in web profile (ChatIQ/Supabase auth user) is an authenticated account; its bookings persist across devices and sessions.
   - A LINE user who has friended the OA is authenticated by LINE on every message (LINE user ID, scoped to that OA); its bookings persist across conversations indefinitely.
   - A LINE-only or web-only customer is a *complete* customer. Neither door is "guest" or secondary.
2. **Vocabulary:** a **channel account** = one login identity at one door (web auth user, LINE user ID). A **customer** = the real person, who may hold several channel accounts. Bookings belong to the customer; channel accounts are the keys.
3. **Linking is additive.** Connecting two doors never invalidates either account; it unifies the customer record behind them.

## 2) Current status (2026-10-21, honest)

| Piece | Status |
|-------|--------|
| `contacts` + `identity_bindings` tables (`team_id, provider, external_id, verified`) | ✅ Built (`supabase/migrations/20261019000000_booking_core_v0.sql`) |
| Claims per turn: `chatiq_conversation`, `line`/`instagram` channel user ID, `web_user` (when logged in) | ✅ Built (`chatiq/src/lib/booking-sibling/chat-turn.ts`) |
| Resolution: match any known binding → same contact; else create contact + bind all presented claims | ✅ Built (`resolveOrCreateContact`) |
| Same web thread / same LINE user across conversations | ✅ Works by design (LINE path **untested on a real LINE bot** — pilot is web) |
| Web, fresh anonymous thread | ⚠️ New contact (conversation claim only) — bookings not carried |
| Name/email/phone on contact | ❌ Not captured (`name="Guest"`, verified always `false`) |
| **LINE ↔ web linking / merge** | ❌ **Not built** — the subject of this doc |
| Admin view of a customer's bindings; admin merge/unmerge | ❌ Not built (Phase 3b) |

**The gap, plainly:** a customer who books on web and asks on LINE (or reverse) is two customers today. `get_existing` on the second door finds nothing.

## 3) The one security rule

**A merge executes only when the person has proven control of BOTH channel accounts in the same ceremony.**

- Names, phone numbers, and emails may *find* candidate accounts; they are **never proof**. Merging on claimed attributes is the classic account-takeover (pre-hijacking) anti-pattern and is forbidden.
- Before a merge, neither side discloses the other side's bookings (no "we found a booking under that phone number"). The concierge offers linking neutrally.
- This follows common best practice for account linking (authenticate on both sides; OWASP-aligned), the same pattern as OAuth account linking and device-linking codes (WhatsApp/Telegram).

## 4) The linking ceremony (symmetric, both directions)

Initiated from the door the customer is currently authenticated at (the *issuing* door), redeemed at the other door (the *proving* door).

1. **Offer.** Customer on LINE asks about a booking that lives on web (or just wants web access). Concierge: *"I don't see a booking under this LINE account. If you booked on our website, I can connect the two accounts — shall I?"* No existence disclosure either way.
2. **Issue.** Sibling command `booking.create_connect_token` (customer actor, own contact): creates a token record — crypto-random, **stored hashed**, one-time, **10-minute expiry**, scoped `(team_id, bot_id)`, bound to the issuing contact. Returns a connect URL + a short code (same token, two presentations).
3. **Prove.** Customer opens the link on web and **logs in fresh** (step-up: a stale web session must re-authenticate). A consent screen states plainly: *"Link LINE account \<display\> with web account \<email\>? You'll see bookings from both in either place."* [Link accounts] / [Cancel]. (Reverse direction: web issues; the customer sends the short code — or taps a LINE deep link — in the LINE chat; sending it from that LINE account is the proof.)
4. **Merge.** On consent, sibling command `booking.redeem_connect_token` validates (exists, unexpired, unused, same team/bot) and runs the merge (§5) atomically. Token is consumed.
5. **Notify.** A confirmation is sent to **both** channels: *"Your LINE and web accounts were just linked. Wasn't you? Contact \<business\>."* (Industry-standard tripwire.)
6. **Result.** Either door now resolves to the surviving customer; `get_existing` sees all bookings.

The LLM may offer the ceremony and redeem a code conversationally (deterministic commands underneath, as always). Admins may *trigger* the same ceremony for an assisted merge; staff can never merge on a caller's say-so — the customer still completes the proof.

## 5) Merge semantics (deterministic, sibling-side)

Command: `booking.merge_contacts` (internal — invoked by `redeem_connect_token` and by admin UI; never directly by the customer LLM).

- **Survivor rule (fixed, not LLM-decided):** the contact with a verified web profile wins; else the older contact. All other outcomes must be deterministic from the two records.
- **Re-point:** `bookings.contact_id`, `booking_sessions.contact_id`, and all `identity_bindings` move to the survivor. No booking is ever deleted by a merge.
- **Tombstone:** the losing contact is kept with `merged_into = <survivor id>` and a merged status, so history and audit remain intelligible; it can never accumulate new bookings.
- **Idempotent:** redeeming/ retrying cannot double-merge or corrupt state. If any binding already points to a *third* customer, the merge **aborts** with `MERGE_CONFLICT` and flags for admin review — never guesses.
- **Audit:** an append-only identity audit record: timestamp, both contact IDs, both channel accounts, initiating actor (customer self-service / named admin), token ID. (New table `identity_audit_log` + `connect_tokens`; migration in Phase 3a.)
- **Unmerge:** admin-only, from the audit record, Phase 3b console. Not self-service.

## 6) Commands added (Phase 3a)

| Command | Actor | Notes |
|---------|-------|-------|
| `booking.create_connect_token` | customer (own contact) | Returns `{ connect_url, short_code, expires_at }` |
| `booking.redeem_connect_token` | customer at proving door | `{ code }` or signed link payload → runs merge → `{ customer_id, merged_contact_id }` |
| `booking.get_customer` | customer (own) / staff | Contact + channel accounts (providers, verified, linked dates) — powers "my accounts" and admin detail |
| `booking.merge_contacts` | **internal/system only** | See §5; not exposed to concierge tools |
| `booking.admin_unmerge` | admin | Phase 3b, from audit record |

Claims hygiene alongside: only **verified** claims may ever be merge keys; `chatiq_conversation` claims are weak (continuity only) and must never initiate a merge alone. LINE bindings stay scoped `(team_id, provider="line", external_id)`; if a team ever runs multiple LINE OAs, scope the provider per integration then.

## 7) Build order & exit tests (Phase 3a DoD — no LLM required for most)

1. Migration: `connect_tokens`, `identity_audit_log`, `contacts.merged_into` (+ status).
2. Sibling: token issue/redeem + merge + `get_customer`, all validated server-side.
3. **API exit tests** (extend smoke style): issue→redeem happy path merges two contacts with bookings on both sides → one customer sees both; expired token rejected; reused token rejected; wrong-team token rejected; binding pointing at third customer → `MERGE_CONFLICT`, nothing merged.
4. **Channel smokes:** (a) LINE persistence — book on a LINE-connected bot, new conversation, lookup finds it; (b) LINE→web link — book on LINE, link, web lookup sees it; (c) web→LINE link via short code in chat; (d) post-merge notification content checked on both channels (or logged delivery in pilot).
5. Concierge surface: offer + code redemption conversation (EN/TH at minimum), still with zero existence disclosure pre-merge.
6. Contact enrichment (small, alongside): LINE display name snapshot on contact; web profile name/email copied at redemption (display only — not merge keys unless verified later).

## 8) Explicitly deferred / open

- Verified email/phone as *additional* proof factors (OTP) — only if a future flow needs linking without one side authenticated; not v1.
- LIFF in-LINE webview redemption — the connect URL should work there later; v1 uses the normal web login.
- Multiple LINE OAs per team; family/shared channel accounts policy (a shared LINE account merging into a personal web account is the account-holder's explicit consent decision at the consent screen).
- Payments identity (Phase later); locations sibling identity sharing.
