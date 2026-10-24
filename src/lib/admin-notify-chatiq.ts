/**
 * Best-effort: tell ChatIQ to notify the customer after a staff booking change.
 * Failures are logged only — the mutation already succeeded.
 */
import { listIdentityBindingsForContact } from "@/lib/supabase/identity";

export type AdminNotifyKind =
  | "cancelled"
  | "rescheduled"
  | "no_show"
  | "created";

function resolveNotifyUrl(): string | null {
  const explicit = process.env.BOOKING_ADMIN_NOTIFY_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const connect = process.env.BOOKING_CONNECT_URL_BASE?.trim();
  if (!connect) return null;
  try {
    const u = new URL(connect);
    return `${u.origin}/api/booking/admin-change-notify`;
  } catch {
    return null;
  }
}

export async function notifyChatIqAdminBookingChange(input: {
  team_id: string;
  bot_id: string;
  contact_id: string;
  kind: AdminNotifyKind;
  starts_at?: string | null;
  previous_starts_at?: string | null;
  timezone?: string | null;
  service_title?: string | null;
  locale?: string | null;
}): Promise<void> {
  const url = resolveNotifyUrl();
  const token =
    process.env.BOOKING_SERVICE_TOKEN?.trim() ||
    process.env.BOOKING_SIBLING_TOKEN?.trim();
  if (!url || !token) {
    return;
  }

  let bindings: Array<{ provider: string; external_id: string }> = [];
  try {
    bindings = await listIdentityBindingsForContact(input.contact_id);
  } catch (err) {
    console.warn(
      "[admin-notify] bindings load failed",
      err instanceof Error ? err.message : err
    );
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        team_id: input.team_id,
        bot_id: input.bot_id,
        contact_id: input.contact_id,
        kind: input.kind,
        starts_at: input.starts_at ?? null,
        previous_starts_at: input.previous_starts_at ?? null,
        timezone: input.timezone ?? null,
        service_title: input.service_title ?? null,
        locale: input.locale ?? null,
        bindings,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[admin-notify] ChatIQ notify failed", {
        status: res.status,
        body: body.slice(0, 300),
      });
    }
  } catch (err) {
    console.warn(
      "[admin-notify] ChatIQ notify error",
      err instanceof Error ? err.message : err
    );
  }
}
