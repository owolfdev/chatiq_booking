/**
 * Phase 1 — structured command execution for the LLM concierge (and API tests).
 *
 * Deterministic in/out: the sibling never parses natural language here and
 * never returns customer-facing prose. The caller (LLM in ChatIQ, admin UI,
 * or a smoke script) renders language. See booking-command-library.md.
 */
import {
  normalizeTimeOfDay,
  searchAvailability,
} from "@/lib/availability";
import {
  BOOKING_API_CONTRACT_VERSION,
  type BookingCommandExecuteRequest,
  type BookingCommandExecuteResponse,
} from "@/lib/contract";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  createConnectToken,
  getCustomerProfile,
  IdentityError,
  redeemConnectToken,
} from "@/lib/supabase/identity";
import {
  cancelBooking,
  createBooking,
  getBookingById,
  getContactById,
  getLatestOpenBooking,
  getOrCreateSession,
  listCatalogItems,
  listTakenStarts,
  resolveOrCreateContact,
  SlotConflictError,
  type DbCatalogItem,
} from "@/lib/supabase/store";

const DEFAULT_TZ = "Asia/Bangkok";

const EXECUTABLE_COMMANDS = new Set([
  "booking.list_services",
  "booking.get_existing",
  "booking.get_availability",
  "booking.create",
  "booking.cancel",
  "booking.reschedule",
  "booking.create_connect_token",
  "booking.redeem_connect_token",
  "booking.get_customer",
]);

type Slots = Record<string, unknown>;

function str(slots: Slots, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = slots[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function fail(
  command: string | undefined,
  code: string,
  error: string
): BookingCommandExecuteResponse {
  return {
    contract_version: BOOKING_API_CONTRACT_VERSION,
    ok: false,
    command,
    error,
    code,
  };
}

function ok(
  command: string,
  data: Record<string, unknown>
): BookingCommandExecuteResponse {
  return {
    contract_version: BOOKING_API_CONTRACT_VERSION,
    ok: true,
    command,
    data,
  };
}

function resolveService(
  items: DbCatalogItem[],
  slots: Slots
): { item: DbCatalogItem } | { error: BookingCommandExecuteResponse } {
  const wanted = str(slots, "service_id", "service_slug", "service");
  if (wanted) {
    const lower = wanted.toLowerCase();
    const found = items.find(
      (i) =>
        i.id === wanted ||
        i.slug.toLowerCase() === lower ||
        i.title.toLowerCase() === lower
    );
    if (!found) {
      return {
        error: fail(
          undefined,
          "SERVICE_NOT_FOUND",
          `Unknown service: ${wanted}`
        ),
      };
    }
    return { item: found };
  }
  if (items.length === 1) return { item: items[0] };
  return {
    error: fail(
      undefined,
      "SERVICE_REQUIRED",
      "Specify service_id or service_slug (catalog has multiple services)."
    ),
  };
}

function isFuture(iso: string | null): boolean {
  return Boolean(iso) && new Date(iso as string).getTime() > Date.now();
}

export async function executeBookingCommand(
  body: BookingCommandExecuteRequest
): Promise<BookingCommandExecuteResponse> {
  const command = body.command?.trim() ?? "";
  if (!EXECUTABLE_COMMANDS.has(command)) {
    return fail(
      command || undefined,
      "UNKNOWN_COMMAND",
      `Unknown command: ${command || "(empty)"}`
    );
  }
  if (!body.team_id?.trim() || !body.bot_id?.trim()) {
    return fail(command, "INVALID_REQUEST", "team_id and bot_id are required");
  }
  if (!isSupabaseConfigured()) {
    return fail(
      command,
      "PERSISTENCE_UNAVAILABLE",
      "Commands API requires Supabase persistence"
    );
  }

  const team_id = body.team_id.trim();
  const bot_id = body.bot_id.trim();
  const timezone = body.timezone?.trim() || DEFAULT_TZ;
  const slots: Slots = body.slots ?? {};
  const actor = body.actor ?? { type: "customer" as const };
  const isStaff = actor.type === "agent" || actor.type === "admin" || actor.type === "provider";

  try {
    const items = await listCatalogItems({ team_id, bot_id });

    if (command === "booking.list_services") {
      return ok(command, {
        services: items.map((i) => ({
          id: i.id,
          slug: i.slug,
          title: i.title,
          duration_minutes: i.duration_minutes,
        })),
        timezone,
      });
    }

    if (command === "booking.get_availability") {
      const svc = resolveService(items, slots);
      if ("error" in svc) return { ...svc.error, command };
      const taken = await listTakenStarts({ team_id, bot_id });
      const limitRaw = slots.limit;
      const found = searchAvailability({
        timeZone: timezone,
        takenStarts: taken,
        dateFrom: str(slots, "date_from", "from") ?? undefined,
        dateTo: str(slots, "date_to", "to") ?? undefined,
        timeOfDay: normalizeTimeOfDay(slots.time_of_day),
        count:
          typeof limitRaw === "number" && Number.isFinite(limitRaw)
            ? limitRaw
            : undefined,
      });
      return ok(command, {
        service: {
          id: svc.item.id,
          slug: svc.item.slug,
          title: svc.item.title,
        },
        slots: found.map((s) => ({
          starts_at: s.starts_at,
          label: s.label,
          timezone,
        })),
        timezone,
      });
    }

    // All remaining commands need a contact.
    let contactId = str(slots, "contact_id");
    if (!contactId) {
      const claims = body.identity_claims ?? [];
      if (claims.length === 0 && !body.conversation_id) {
        return fail(
          command,
          "IDENTITY_REQUIRED",
          "Provide identity_claims, conversation_id, or slots.contact_id"
        );
      }
      const contact = await resolveOrCreateContact({
        team_id,
        claims: body.conversation_id
          ? [
              ...claims,
              {
                provider: "chatiq_conversation",
                external_id: body.conversation_id,
                verified: false,
              },
            ]
          : claims,
      });
      contactId = contact.id;
    } else {
      const contact = await getContactById({ team_id, contact_id: contactId });
      if (!contact) {
        return fail(command, "CONTACT_NOT_FOUND", `Unknown contact: ${contactId}`);
      }
    }

    if (command === "booking.create_connect_token") {
      const issued = await createConnectToken({
        team_id,
        bot_id,
        contact_id: contactId,
      });
      const urlBase = process.env.BOOKING_CONNECT_URL_BASE?.trim();
      return ok(command, {
        contact_id: contactId,
        token: issued.token,
        short_code: issued.short_code,
        expires_at: issued.expires_at,
        connect_url: urlBase
          ? `${urlBase.replace(/\/$/, "")}?token=${issued.token}`
          : null,
      });
    }

    if (command === "booking.get_customer") {
      const profile = await getCustomerProfile({ team_id, bot_id, contact_id: contactId });
      if (!profile) {
        return fail(command, "CONTACT_NOT_FOUND", `Unknown contact: ${contactId}`);
      }
      return ok(command, {
        contact: {
          id: profile.contact.id,
          name: profile.contact.name,
          email: profile.contact.email,
          phone: profile.contact.phone,
        },
        bindings: profile.bindings,
        upcoming_bookings: profile.upcoming_bookings,
      });
    }

    if (command === "booking.redeem_connect_token") {
      const code = str(slots, "code", "token", "connect_code", "short_code");
      if (!code) {
        return fail(command, "INVALID_REQUEST", "slots.code (connect token or short code) is required");
      }
      try {
        const redeemed = await redeemConnectToken({
          team_id,
          bot_id,
          code,
          redeeming_contact_id: contactId,
          actor_type: actor.type,
          actor_id: actor.id ?? null,
        });
        return ok(command, {
          contact_id: redeemed.survivor_contact_id,
          survivor_contact_id: redeemed.survivor_contact_id,
          merged_contact_id: redeemed.merged_contact_id,
          already_linked: redeemed.already_linked,
        });
      } catch (err) {
        if (err instanceof IdentityError) {
          return fail(command, err.code, err.message);
        }
        throw err;
      }
    }

    if (command === "booking.get_existing") {
      const booking = await getLatestOpenBooking({ team_id, bot_id, contact_id: contactId });
      return ok(command, {
        contact_id: contactId,
        booking: booking
          ? {
              id: booking.id,
              status: booking.status,
              starts_at: booking.starts_at,
              timezone: booking.timezone,
              catalog_item_id: booking.catalog_item_id,
            }
          : null,
      });
    }

    if (command === "booking.create") {
      const svc = resolveService(items, slots);
      if ("error" in svc) return { ...svc.error, command };
      const startsAt = str(slots, "starts_at", "start_at", "slot");
      if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) {
        return fail(command, "INVALID_REQUEST", "slots.starts_at (ISO) is required");
      }
      if (!isFuture(startsAt)) {
        return fail(command, "SLOT_IN_PAST", "starts_at must be in the future");
      }
      const session = await getOrCreateSession({
        team_id,
        bot_id,
        contact_id: contactId,
        conversation_id: body.conversation_id ?? null,
        timezone,
      });
      try {
        const booking = await createBooking({
          team_id,
          bot_id,
          contact_id: contactId,
          session_id: session.id,
          catalog_item_id: svc.item.id,
          starts_at: new Date(startsAt).toISOString(),
          timezone,
        });
        return ok(command, {
          contact_id: contactId,
          booking: {
            id: booking.id,
            status: booking.status,
            starts_at: booking.starts_at,
            timezone: booking.timezone,
            catalog_item_id: booking.catalog_item_id,
          },
        });
      } catch (err) {
        if (err instanceof SlotConflictError) {
          return fail(command, "SLOT_TAKEN", "That time was just taken");
        }
        throw err;
      }
    }

    // cancel / reschedule share booking resolution + confirmation gate.
    const bookingId = str(slots, "booking_id", "id");
    const existing = bookingId
      ? await getBookingById({ team_id, bot_id, booking_id: bookingId })
      : await getLatestOpenBooking({ team_id, bot_id, contact_id: contactId });
    if (!existing) {
      return fail(command, "BOOKING_NOT_FOUND", "No matching booking");
    }
    if (!isStaff && existing.contact_id && existing.contact_id !== contactId) {
      return fail(command, "BOOKING_NOT_FOUND", "No matching booking");
    }
    if (existing.status !== "pending" && existing.status !== "confirmed") {
      return fail(command, "BOOKING_NOT_ACTIVE", `Booking is ${existing.status}`);
    }
    if (!isFuture(existing.starts_at)) {
      return fail(command, "BOOKING_IN_PAST", "Booking is in the past");
    }
    if (slots.confirmed !== true) {
      return fail(
        command,
        "CONFIRMATION_REQUIRED",
        "Mutating commands require slots.confirmed=true after explicit customer confirmation"
      );
    }

    if (command === "booking.cancel") {
      const cancelled = await cancelBooking({
        booking_id: existing.id,
        notes: `cancelled via commands API (${actor.type})`,
      });
      return ok(command, {
        contact_id: contactId,
        booking: cancelled
          ? { id: cancelled.id, status: cancelled.status, starts_at: cancelled.starts_at }
          : { id: existing.id, status: "cancelled" },
      });
    }

    // booking.reschedule: create the new booking first so a conflict
    // never loses the original appointment.
    const svc = resolveService(items, slots);
    if ("error" in svc) return { ...svc.error, command };
    const newStart = str(slots, "new_starts_at", "starts_at", "slot");
    if (!newStart || Number.isNaN(new Date(newStart).getTime())) {
      return fail(command, "INVALID_REQUEST", "slots.new_starts_at (ISO) is required");
    }
    if (!isFuture(newStart)) {
      return fail(command, "SLOT_IN_PAST", "new_starts_at must be in the future");
    }
    if (
      existing.starts_at &&
      new Date(newStart).getTime() === new Date(existing.starts_at).getTime()
    ) {
      return fail(command, "SAME_SLOT", "New time is the same as the current booking");
    }
    const session = await getOrCreateSession({
      team_id,
      bot_id,
      contact_id: contactId,
      conversation_id: body.conversation_id ?? null,
      timezone,
    });
    let created;
    try {
      created = await createBooking({
        team_id,
        bot_id,
        contact_id: contactId,
        session_id: session.id,
        catalog_item_id: svc.item.id,
        starts_at: new Date(newStart).toISOString(),
        timezone,
      });
    } catch (err) {
      if (err instanceof SlotConflictError) {
        return fail(command, "SLOT_TAKEN", "That time was just taken");
      }
      throw err;
    }
    const cancelled = await cancelBooking({
      booking_id: existing.id,
      notes: `cancelled for reschedule via commands API (${actor.type})`,
    });
    return ok(command, {
      contact_id: contactId,
      previous_booking: {
        id: existing.id,
        status: cancelled?.status ?? "cancelled",
        starts_at: existing.starts_at,
      },
      booking: {
        id: created.id,
        status: created.status,
        starts_at: created.starts_at,
        timezone: created.timezone,
        catalog_item_id: created.catalog_item_id,
      },
    });
  } catch (err) {
    console.error("[booking] command execute failed", command, err);
    return fail(
      command,
      "EXECUTION_FAILED",
      err instanceof Error ? err.message : "Command execution failed"
    );
  }
}
