# Guest booking notifications

Last updated: 2026-11-02  
Status: **v1 live (email + existing LINE/web chat)**  
Mission: [`_mission-booking-sibling-v1.md`](./_mission-booking-sibling-v1.md)

## What ships

| Channel | When | Who implements |
|---------|------|----------------|
| **In-chat** | Concierge confirms create / cancel / reschedule | ChatIQ concierge reply |
| **LINE push + web chat notice** | Staff mutates a booking (create-on-behalf, cancel, reschedule, no-show) | ChatIQ `notifyBookingAdminChange` via sibling → `/api/booking/admin-change-notify` |
| **Email (Resend)** | Create / cancel / reschedule when an email is available | ChatIQ — concierge path + staff admin-change path |

Email is **best-effort**: never blocks the booking mutation. Skips when `RESEND_API_KEY` is unset or no address exists.

## Email address source of truth

1. Prefer **signed-in ChatIQ user email** (`web_user` session) on the concierge path.  
2. Else **contact.email** (enrichment from login / profile; display + mail only — not a merge key).  
3. LINE-only / anonymous web with no email → no email (chat / LINE only).

Identity rules unchanged: [`identity-and-account-linking.md`](./identity-and-account-linking.md).

## Code (ChatIQ)

- Template: `chatiq/src/lib/email/templates/booking-confirmation.ts`  
- Send helper: `chatiq/src/lib/email/send-booking-confirmation-email.ts`  
- Concierge hook: `chatiq/src/lib/booking-sibling/booking-email-notify.ts` (after `booking.create` / `cancel` / `reschedule`)  
- Staff path: `chatiq/src/lib/booking-sibling/admin-change-notifications.ts` (email alongside LINE/web; skips `no_show`)

## Out of scope (v1)

- Asking anonymous guests for email mid-flow  
- Guest notes / internal notes schema split  
- Claiming anonymous conversation bookings into a later login (separate identity gap)  
- Deduping chat + email content aggressively beyond short chat + email receipt  
