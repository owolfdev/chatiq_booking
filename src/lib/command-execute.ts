/**
 * Phase 1 — structured command execution for the LLM concierge (and API tests).
 *
 * Deterministic in/out: the sibling never parses natural language here and
 * never returns customer-facing prose. The caller (LLM in ChatIQ, admin UI,
 * or a smoke script) renders language. See booking-command-library.md.
 */
import {
  groupHoursByWeekday,
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
  reorderCatalogServices,
  searchCatalogServices,
  setCatalogServiceActive,
  upsertCatalogService,
} from "@/lib/supabase/catalog";
import {
  addBlock,
  ensureDefaultHoursIfEmpty,
  getBotBookingSettings,
  listBlocks,
  listExceptions,
  listHours,
  removeBlock,
  setException,
  setHours,
  upsertBotBookingSettings,
} from "@/lib/supabase/hours";
import {
  createConnectToken,
  getCustomerProfile,
  IdentityError,
  redeemConnectToken,
} from "@/lib/supabase/identity";
import {
  cancelBooking,
  createBooking,
  enrichContactDisplay,
  getBookingById,
  getContactById,
  getLatestOpenBooking,
  getOrCreateSession,
  listCatalogItems,
  listOccupiedIntervals,
  resolveOrCreateContact,
  SlotConflictError,
  type DbCatalogItem,
} from "@/lib/supabase/store";

const DEFAULT_TZ = "Asia/Bangkok";

const EXECUTABLE_COMMANDS = new Set([
  "booking.list_services",
  "booking.search_services",
  "booking.get_existing",
  "booking.get_availability",
  "booking.create",
  "booking.cancel",
  "booking.reschedule",
  "booking.create_connect_token",
  "booking.redeem_connect_token",
  "booking.get_customer",
  "catalog.upsert_service",
  "catalog.set_active",
  "catalog.reorder",
  "availability.set_hours",
  "availability.set_exception",
  "availability.block",
  "availability.unblock",
  "availability.get_schedule",
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
          category: i.category ?? null,
          sort_order: i.sort_order ?? 0,
          description: i.description ?? null,
          price_cents: i.price_cents ?? null,
          currency: i.currency ?? null,
        })),
        timezone,
      });
    }

    if (command === "booking.search_services") {
      const found = await searchCatalogServices({
        team_id,
        bot_id,
        query: str(slots, "query", "q", "keyword"),
        category: str(slots, "category"),
        limit:
          typeof slots.limit === "number" && Number.isFinite(slots.limit)
            ? slots.limit
            : undefined,
      });
      return ok(command, {
        services: found.map((i) => ({
          id: i.id,
          slug: i.slug,
          title: i.title,
          duration_minutes: i.duration_minutes,
          category: i.category,
          sort_order: i.sort_order,
        })),
        timezone,
      });
    }

    if (command === "booking.get_availability") {
      const svc = resolveService(items, slots);
      if ("error" in svc) return { ...svc.error, command };
      await ensureDefaultHoursIfEmpty({ team_id, bot_id });
      const settings = await getBotBookingSettings({ team_id, bot_id });
      const tz = settings.timezone || timezone;
      const hourRows = await listHours({ team_id, bot_id });
      const hoursByWeekday = groupHoursByWeekday(hourRows);
      const dateFrom = str(slots, "date_from", "from") ?? undefined;
      const dateTo = str(slots, "date_to", "to") ?? undefined;
      const exceptions = await listExceptions({
        team_id,
        bot_id,
        from_date: dateFrom,
        to_date: dateTo,
      });
      const blocks = await listBlocks({
        team_id,
        bot_id,
        from: dateFrom,
        to: dateTo,
      });
      const occupied = await listOccupiedIntervals({ team_id, bot_id });
      const limitRaw = slots.limit;
      const found = searchAvailability({
        timeZone: tz,
        hoursByWeekday,
        exceptions,
        blocks,
        occupied,
        durationMinutes: svc.item.duration_minutes,
        bufferBeforeMinutes: svc.item.buffer_before_minutes ?? 0,
        bufferAfterMinutes: svc.item.buffer_after_minutes ?? 0,
        capacity: svc.item.capacity ?? 1,
        slotStepMinutes: settings.slot_step_minutes,
        minNoticeMinutes:
          svc.item.min_notice_minutes ?? settings.min_notice_minutes,
        bookingHorizonDays:
          svc.item.booking_horizon_days ?? settings.booking_horizon_days,
        dateFrom,
        dateTo,
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
          duration_minutes: svc.item.duration_minutes,
        },
        slots: found.map((s) => ({
          starts_at: s.starts_at,
          label: s.label,
          timezone: tz,
        })),
        timezone: tz,
      });
    }

    // --- Admin catalog / hours (staff only; no customer identity) ---
    if (command.startsWith("catalog.") || command.startsWith("availability.")) {
      if (!isStaff && actor.type !== "system") {
        return fail(command, "FORBIDDEN", "Admin actor required");
      }

      if (command === "catalog.upsert_service") {
        const title = str(slots, "title");
        const durationRaw = slots.duration_minutes;
        const duration =
          typeof durationRaw === "number"
            ? durationRaw
            : Number(str(slots, "duration_minutes"));
        if (!title || !Number.isFinite(duration)) {
          return fail(
            command,
            "INVALID_REQUEST",
            "title and duration_minutes are required"
          );
        }
        try {
          const service = await upsertCatalogService({
            team_id,
            bot_id,
            id: str(slots, "id", "service_id"),
            slug: str(slots, "slug"),
            title,
            duration_minutes: duration,
            description: str(slots, "description"),
            category: str(slots, "category"),
            sort_order:
              typeof slots.sort_order === "number" ? slots.sort_order : undefined,
            buffer_before_minutes:
              typeof slots.buffer_before_minutes === "number"
                ? slots.buffer_before_minutes
                : undefined,
            buffer_after_minutes:
              typeof slots.buffer_after_minutes === "number"
                ? slots.buffer_after_minutes
                : undefined,
            capacity:
              typeof slots.capacity === "number" ? slots.capacity : undefined,
            price_cents:
              typeof slots.price_cents === "number" ? slots.price_cents : null,
            currency: str(slots, "currency"),
            booking_horizon_days:
              typeof slots.booking_horizon_days === "number"
                ? slots.booking_horizon_days
                : undefined,
            min_notice_minutes:
              typeof slots.min_notice_minutes === "number"
                ? slots.min_notice_minutes
                : undefined,
            active:
              typeof slots.active === "boolean" ? slots.active : undefined,
          });
          return ok(command, { service });
        } catch (err) {
          return fail(
            command,
            "INVALID_REQUEST",
            err instanceof Error ? err.message : "upsert failed"
          );
        }
      }

      if (command === "catalog.set_active") {
        const idOrSlug = str(slots, "id", "service_id", "slug", "service_slug");
        if (!idOrSlug || typeof slots.active !== "boolean") {
          return fail(
            command,
            "INVALID_REQUEST",
            "id/slug and active (boolean) are required"
          );
        }
        try {
          const service = await setCatalogServiceActive({
            team_id,
            bot_id,
            id_or_slug: idOrSlug,
            active: slots.active,
          });
          return ok(command, { service });
        } catch {
          return fail(command, "SERVICE_NOT_FOUND", `Unknown service: ${idOrSlug}`);
        }
      }

      if (command === "catalog.reorder") {
        const ordered = slots.ordered_ids;
        if (!Array.isArray(ordered) || ordered.length === 0) {
          return fail(command, "INVALID_REQUEST", "ordered_ids array is required");
        }
        const services = await reorderCatalogServices({
          team_id,
          bot_id,
          ordered_ids: ordered.map(String),
        });
        return ok(command, { services });
      }

      if (command === "availability.set_hours") {
        const hoursRaw = slots.hours;
        if (!Array.isArray(hoursRaw)) {
          return fail(
            command,
            "INVALID_REQUEST",
            "hours array is required (use [] to clear)"
          );
        }
        try {
          const hours = await setHours({
            team_id,
            bot_id,
            hours: hoursRaw.map((h) => {
              const row = h as Record<string, unknown>;
              return {
                weekday: Number(row.weekday),
                start_local: String(row.start_local ?? row.start),
                end_local: String(row.end_local ?? row.end),
              };
            }),
          });
          if (typeof slots.timezone === "string" && slots.timezone.trim()) {
            await upsertBotBookingSettings({
              team_id,
              bot_id,
              timezone: slots.timezone.trim(),
            });
          }
          return ok(command, { hours });
        } catch (err) {
          return fail(
            command,
            "INVALID_REQUEST",
            err instanceof Error ? err.message : "set_hours failed"
          );
        }
      }

      if (command === "availability.set_exception") {
        const onDate = str(slots, "on_date", "date");
        if (!onDate) {
          return fail(command, "INVALID_REQUEST", "on_date is required");
        }
        try {
          const exception = await setException({
            team_id,
            bot_id,
            on_date: onDate,
            closed: slots.closed !== false,
            start_local: str(slots, "start_local", "start"),
            end_local: str(slots, "end_local", "end"),
            note: str(slots, "note"),
          });
          return ok(command, { exception });
        } catch (err) {
          return fail(
            command,
            "INVALID_REQUEST",
            err instanceof Error ? err.message : "set_exception failed"
          );
        }
      }

      if (command === "availability.block") {
        const startsAt = str(slots, "starts_at", "start");
        const endsAt = str(slots, "ends_at", "end");
        if (!startsAt || !endsAt) {
          return fail(
            command,
            "INVALID_REQUEST",
            "starts_at and ends_at are required"
          );
        }
        try {
          const block = await addBlock({
            team_id,
            bot_id,
            starts_at: startsAt,
            ends_at: endsAt,
            reason: str(slots, "reason"),
          });
          return ok(command, { block });
        } catch (err) {
          return fail(
            command,
            "INVALID_REQUEST",
            err instanceof Error ? err.message : "block failed"
          );
        }
      }

      if (command === "availability.unblock") {
        const blockId = str(slots, "block_id", "id");
        if (!blockId) {
          return fail(command, "INVALID_REQUEST", "block_id is required");
        }
        const removed = await removeBlock({
          team_id,
          bot_id,
          block_id: blockId,
        });
        if (!removed) {
          return fail(command, "NOT_FOUND", `Unknown block: ${blockId}`);
        }
        return ok(command, { removed: true, block_id: blockId });
      }

      if (command === "availability.get_schedule") {
        const settings = await getBotBookingSettings({ team_id, bot_id });
        const hours = await listHours({ team_id, bot_id });
        const exceptions = await listExceptions({ team_id, bot_id });
        const blocks = await listBlocks({ team_id, bot_id });
        return ok(command, { settings, hours, exceptions, blocks });
      }

      return fail(command, "UNKNOWN_COMMAND", `Unknown command: ${command}`);
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
      // conversation_id is often already present as a chatiq_conversation
      // claim (ChatIQ adapter). Append only when missing — a duplicate in
      // the claims array causes a unique-constraint failure on insert.
      const mergedClaims = [...claims];
      if (body.conversation_id) {
        const already = mergedClaims.some(
          (c) =>
            c.provider === "chatiq_conversation" &&
            c.external_id === body.conversation_id
        );
        if (!already) {
          mergedClaims.push({
            provider: "chatiq_conversation",
            external_id: body.conversation_id,
            verified: false,
          });
        }
      }
      const contact = await resolveOrCreateContact({
        team_id,
        claims: mergedClaims,
        name: body.contact_profile?.name,
        email: body.contact_profile?.email,
      });
      contactId = contact.id;
    } else {
      const contact = await getContactById({ team_id, contact_id: contactId });
      if (!contact) {
        return fail(command, "CONTACT_NOT_FOUND", `Unknown contact: ${contactId}`);
      }
      await enrichContactDisplay({
        team_id,
        contact_id: contactId,
        name: body.contact_profile?.name,
        email: body.contact_profile?.email,
      });
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
          issuing_bot_id: redeemed.issuing_bot_id,
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
