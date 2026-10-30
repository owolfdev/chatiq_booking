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
import { COMMAND_CATALOG } from "@/lib/admin/command-catalog";
import {
  notifyChatIqAdminBookingChange,
  type AdminNotifyKind,
} from "@/lib/admin-notify-chatiq";
import {
  BOOKING_API_CONTRACT_VERSION,
  type BookingCommandExecuteRequest,
  type BookingCommandExecuteResponse,
} from "@/lib/contract";
import { botHasShape, normalizeShapes } from "@/lib/shapes";
import {
  assignLinkedResourcesAt,
  isResourceFreeAt,
  searchAvailabilityForResources,
} from "@/lib/shapes/resources-availability";
import {
  nightsBetween,
  searchStayAvailability,
  stayDateToUtc,
  stayUtcToYmd,
} from "@/lib/shapes/stays-availability";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  listCatalogServices,
  reorderCatalogServices,
  searchCatalogServices,
  setCatalogServiceActive,
  setServiceRequireResourceKinds,
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
  listCommandAudit,
  writeCommandAudit,
} from "@/lib/supabase/command-audit";
import {
  createConnectToken,
  getCustomerProfile,
  IdentityError,
  listIdentityAudit,
  redeemConnectToken,
  resolveSurvivorContactId,
  unmergeFromAudit,
} from "@/lib/supabase/identity";
import {
  getResource,
  listEligibleResources,
  listResources,
  mapServiceResourceAnnotations,
  setResourceActive,
  setServiceResources,
  upsertResource,
  type DbResource,
} from "@/lib/supabase/resources";
import {
  cancelBooking,
  createBooking,
  deleteBooking,
  enrichContactDisplay,
  getBookingById,
  getContactById,
  findOpenBookingByShortRef,
  getLatestOpenBooking,
  getOrCreateSession,
  isShortBookingRef,
  listCatalogItems,
  listOccupiedIntervals,
  listOpenBookings,
  listStayOccupied,
  markBookingNoShow,
  resolveOrCreateContact,
  SlotConflictError,
  type DbBooking,
  type DbCatalogItem,
} from "@/lib/supabase/store";

const DEFAULT_TZ = "Asia/Bangkok";

/** Kept in sync via command-catalog.ts (admin reference + ⌘K). */
const EXECUTABLE_COMMANDS = new Set(COMMAND_CATALOG.map((c) => c.id));

type Slots = Record<string, unknown>;

function str(slots: Slots, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = slots[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Guest/staff short ref — same 8-char prefix as ChatIQ schedule Id column. */
function shortBookingRef(bookingId: string): string {
  return bookingId.slice(0, 8);
}

function serializeCustomerBooking(
  booking: DbBooking,
  items: DbCatalogItem[],
  fallbackTz: string
): Record<string, unknown> {
  const tz = booking.timezone || fallbackTz;
  const isStay = Boolean(booking.ends_at && booking.starts_at);
  const checkIn =
    isStay && booking.starts_at
      ? stayUtcToYmd(booking.starts_at, tz)
      : null;
  const checkOut =
    isStay && booking.ends_at
      ? stayUtcToYmd(booking.ends_at, tz)
      : null;
  const service = items.find((i) => i.id === booking.catalog_item_id) ?? null;
  return {
    id: booking.id,
    booking_ref: shortBookingRef(booking.id),
    status: booking.status,
    starts_at: booking.starts_at,
    timezone: tz,
    catalog_item_id: booking.catalog_item_id,
    resource_id: booking.resource_id ?? null,
    ends_at: booking.ends_at ?? null,
    shape: isStay ? "stays" : "appointments",
    check_in: checkIn,
    check_out: checkOut,
    nights: checkIn && checkOut ? nightsBetween(checkIn, checkOut) : null,
    service: service
      ? {
          id: service.id,
          slug: service.slug,
          title: service.title,
        }
      : null,
  };
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

function resourcePayload(r: DbResource) {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    kind: r.kind,
    active: r.active,
    sort_order: r.sort_order,
  };
}

function isStayAvailabilityRequest(
  slots: Slots,
  shapes: string[]
): boolean {
  if (!botHasShape(shapes, "stays")) return false;
  const mode = str(slots, "mode", "booking_kind", "shape");
  if (mode === "stay" || mode === "stays") return true;
  if (
    str(slots, "check_in", "checkin", "arrival") ||
    str(slots, "check_out", "checkout", "departure") ||
    (typeof slots.nights === "number" && Number.isFinite(slots.nights))
  ) {
    return true;
  }
  // Stays-only bot: night search is the default.
  return !botHasShape(shapes, "appointments");
}

async function resolvePinnedResources(input: {
  team_id: string;
  bot_id: string;
  slots: Slots;
  eligible: DbResource[];
}): Promise<
  | {
      pinned: DbResource[];
      preference: "any" | "specific";
      /** Legacy single primary (person preferred). */
      resource: DbResource | null;
    }
  | { error: BookingCommandExecuteResponse }
> {
  const keys = [
    str(input.slots, "resource_id", "resource_slug", "resource", "provider_id", "clinician"),
    str(input.slots, "room_id", "room_slug", "room"),
  ].filter((k): k is string => Boolean(k));

  const prefRaw = str(input.slots, "resource_preference", "preference");
  const preference: "any" | "specific" =
    keys.length > 0 || prefRaw === "specific" ? "specific" : "any";

  const pinned: DbResource[] = [];
  for (const wanted of keys) {
    const lower = wanted.toLowerCase();
    const fromEligible = input.eligible.find(
      (r) =>
        r.id === wanted ||
        r.slug.toLowerCase() === lower ||
        r.title.toLowerCase() === lower
    );
    let found = fromEligible;
    if (!found) {
      const loaded = await getResource({
        team_id: input.team_id,
        bot_id: input.bot_id,
        id_or_slug: wanted,
      });
      if (!loaded || !loaded.active) {
        return {
          error: fail(
            undefined,
            "RESOURCE_NOT_FOUND",
            `Unknown resource: ${wanted}`
          ),
        };
      }
      if (!input.eligible.some((r) => r.id === loaded.id)) {
        return {
          error: fail(
            undefined,
            "RESOURCE_NOT_ELIGIBLE",
            `${loaded.title} cannot deliver this service`
          ),
        };
      }
      found = loaded;
    }
    if (!pinned.some((p) => p.id === found!.id)) pinned.push(found);
  }

  const resource =
    pinned.find((r) => r.kind === "person") ?? pinned[0] ?? null;
  return { pinned, preference, resource };
}

/** @deprecated name kept for call sites — wraps resolvePinnedResources. */
async function resolveResourceFromSlots(input: {
  team_id: string;
  bot_id: string;
  slots: Slots;
  eligible: DbResource[];
}): Promise<
  | { resource: DbResource | null; preference: "any" | "specific"; pinned: DbResource[] }
  | { error: BookingCommandExecuteResponse }
> {
  const resolved = await resolvePinnedResources(input);
  if ("error" in resolved) return resolved;
  return {
    resource: resolved.resource,
    preference: resolved.preference,
    pinned: resolved.pinned,
  };
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
  const isStaff =
    actor.type === "agent" ||
    actor.type === "admin" ||
    actor.type === "provider";
  const isSystem = actor.type === "system";
  /** Provider shares the bot calendar in v1 (resources shape later). */
  const via = actor.via ?? "api";

  const audit = async (input: {
    command: string;
    contact_id?: string | null;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    ok?: boolean;
    error_code?: string | null;
  }) => {
    await writeCommandAudit({
      team_id,
      bot_id,
      command: input.command,
      actor_type: actor.type,
      actor_id: actor.id ?? null,
      via,
      contact_id: input.contact_id,
      before: input.before,
      after: input.after,
      ok: input.ok,
      error_code: input.error_code,
      slots,
    });
  };

  try {
    const items = await listCatalogItems({ team_id, bot_id });

    const notifyCustomer = (
      kind: AdminNotifyKind,
      input: {
        contact_id: string;
        starts_at?: string | null;
        previous_starts_at?: string | null;
        timezone?: string | null;
        catalog_item_id?: string | null;
      }
    ) => {
      if (!isStaff && !isSystem) return;
      const service_title =
        input.catalog_item_id && items.length
          ? items.find((i) => i.id === input.catalog_item_id)?.title ?? null
          : null;
      const locale = typeof slots.locale === "string" ? slots.locale : null;
      void notifyChatIqAdminBookingChange({
        team_id,
        bot_id,
        contact_id: input.contact_id,
        kind,
        starts_at: input.starts_at,
        previous_starts_at: input.previous_starts_at,
        timezone: input.timezone ?? timezone,
        service_title,
        locale,
      });
    };

    if (command === "booking.get_bot_capabilities") {
      const settings = await getBotBookingSettings({ team_id, bot_id });
      const shapes = normalizeShapes(settings.shapes);
      return ok(command, {
        shapes,
        resources_enabled: shapes.includes("resources"),
        stays_enabled: shapes.includes("stays"),
        timezone: settings.timezone || timezone,
      });
    }

    if (command === "booking.list_services") {
      const includeInactive =
        Boolean(slots.include_inactive) && (isStaff || actor.type === "system");
      const list = includeInactive
        ? await listCatalogServices({
            team_id,
            bot_id,
            active_only: false,
          })
        : items;
      const settings = await getBotBookingSettings({ team_id, bot_id });
      const annotateResources = botHasShape(settings.shapes, "resources");
      const resourceMap = annotateResources
        ? await mapServiceResourceAnnotations({
            team_id,
            bot_id,
            catalog_item_ids: list.map((i) => i.id),
          })
        : null;
      return ok(command, {
        services: list.map((i) => ({
          id: i.id,
          slug: i.slug,
          title: i.title,
          duration_minutes: i.duration_minutes,
          active: i.active,
          category: i.category ?? null,
          sort_order: i.sort_order ?? 0,
          description: i.description ?? null,
          buffer_before_minutes: i.buffer_before_minutes ?? 0,
          buffer_after_minutes: i.buffer_after_minutes ?? 0,
          capacity: i.capacity ?? 1,
          price_cents: i.price_cents ?? null,
          currency: i.currency ?? null,
          require_resource_kinds: i.require_resource_kinds ?? [],
          ...(resourceMap
            ? { resources: resourceMap.get(i.id) ?? [] }
            : {}),
        })),
        shapes: normalizeShapes(settings.shapes),
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
      const dateFrom = str(slots, "date_from", "from") ?? undefined;
      const dateTo = str(slots, "date_to", "to") ?? undefined;
      const limitRaw = slots.limit;
      const count =
        typeof limitRaw === "number" && Number.isFinite(limitRaw)
          ? limitRaw
          : undefined;

      if (isStayAvailabilityRequest(slots, settings.shapes)) {
        if (!botHasShape(settings.shapes, "stays")) {
          return fail(
            command,
            "SHAPE_DISABLED",
            "stays shape is not enabled for this bot"
          );
        }
        const checkIn = str(slots, "check_in", "checkin", "arrival");
        const checkOut = str(slots, "check_out", "checkout", "departure");
        const nightsRaw = slots.nights;
        const nights =
          typeof nightsRaw === "number" && Number.isFinite(nightsRaw)
            ? nightsRaw
            : checkIn && checkOut
              ? nightsBetween(checkIn, checkOut)
              : undefined;
        const occupied = await listStayOccupied({
          team_id,
          bot_id,
          catalog_item_id: svc.item.id,
        });
        const found = searchStayAvailability({
          timeZone: tz,
          checkIn: checkIn ?? undefined,
          checkOut: checkOut ?? undefined,
          nights,
          dateFrom,
          dateTo,
          capacity: svc.item.capacity ?? 1,
          occupied,
          minNoticeMinutes:
            svc.item.min_notice_minutes ?? settings.min_notice_minutes,
          bookingHorizonDays:
            svc.item.booking_horizon_days ?? settings.booking_horizon_days,
          count,
        });
        return ok(command, {
          shape: "stays",
          service: {
            id: svc.item.id,
            slug: svc.item.slug,
            title: svc.item.title,
            capacity: svc.item.capacity ?? 1,
          },
          slots: found.map((s) => ({
            check_in: s.check_in,
            check_out: s.check_out,
            nights: s.nights,
            starts_at: s.starts_at,
            ends_at: s.ends_at,
            label: s.label,
            remaining: s.remaining,
            timezone: tz,
          })),
          timezone: tz,
        });
      }

      // Stay params without the shape → fail closed.
      if (
        str(slots, "check_in", "checkin") ||
        str(slots, "check_out", "checkout") ||
        (typeof slots.nights === "number" && Number.isFinite(slots.nights)) ||
        str(slots, "mode", "booking_kind") === "stay" ||
        str(slots, "mode", "booking_kind") === "stays"
      ) {
        return fail(
          command,
          "SHAPE_DISABLED",
          "stays shape is not enabled for this bot"
        );
      }

      const hourRows = await listHours({ team_id, bot_id });
      const hoursByWeekday = groupHoursByWeekday(hourRows);
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
      const commonAvail = {
        timeZone: tz,
        hoursByWeekday,
        exceptions,
        blocks,
        durationMinutes: svc.item.duration_minutes,
        bufferBeforeMinutes: svc.item.buffer_before_minutes ?? 0,
        bufferAfterMinutes: svc.item.buffer_after_minutes ?? 0,
        slotStepMinutes: settings.slot_step_minutes,
        minNoticeMinutes:
          svc.item.min_notice_minutes ?? settings.min_notice_minutes,
        bookingHorizonDays:
          svc.item.booking_horizon_days ?? settings.booking_horizon_days,
        dateFrom,
        dateTo,
        timeOfDay: normalizeTimeOfDay(slots.time_of_day),
        count,
      };

      if (botHasShape(settings.shapes, "resources")) {
        const eligible = await listEligibleResources({
          team_id,
          bot_id,
          catalog_item_id: svc.item.id,
          active_only: true,
        });
        if (eligible.length === 0) {
          return fail(
            command,
            "NO_ELIGIBLE_RESOURCES",
            "No resources are linked to this service"
          );
        }
        const resolved = await resolveResourceFromSlots({
          team_id,
          bot_id,
          slots,
          eligible,
        });
        if ("error" in resolved) return { ...resolved.error, command };
        const requireKinds = svc.item.require_resource_kinds ?? [];
        const linked = requireKinds.length >= 2;
        // Single-resource mode: pin narrows the pool. Linked mode: search all
        // eligible and honor pins inside the linker.
        const pool =
          !linked && resolved.resource ? [resolved.resource] : eligible;
        const occupiedByResource = new Map<
          string,
          Awaited<ReturnType<typeof listOccupiedIntervals>>
        >();
        for (const r of pool) {
          occupiedByResource.set(
            r.id,
            await listOccupiedIntervals({
              team_id,
              bot_id,
              resource_id: r.id,
            })
          );
        }
        const found = await searchAvailabilityForResources({
          ...commonAvail,
          resources: pool,
          occupiedByResource,
          requireKinds: linked ? requireKinds : undefined,
          pinnedResourceIds: resolved.pinned.map((p) => p.id),
        });
        return ok(command, {
          service: {
            id: svc.item.id,
            slug: svc.item.slug,
            title: svc.item.title,
            duration_minutes: svc.item.duration_minutes,
            require_resource_kinds: requireKinds,
          },
          resource_preference: resolved.preference,
          resources: pool.map(resourcePayload),
          slots: found.map((s) => ({
            starts_at: s.starts_at,
            label: s.label,
            timezone: tz,
            resources: s.resources,
            resource_id: s.resource_id,
            resource_slug: s.resource_slug,
            resource_title: s.resource_title,
            resource_kind: s.resource_kind,
          })),
          timezone: tz,
        });
      }

      // Resource slots without the shape → fail closed.
      if (
        str(slots, "resource_id", "resource_slug", "resource") ||
        str(slots, "resource_preference") === "specific"
      ) {
        return fail(
          command,
          "SHAPE_DISABLED",
          "resources shape is not enabled for this bot"
        );
      }

      const occupied = await listOccupiedIntervals({ team_id, bot_id });
      const found = searchAvailability({
        ...commonAvail,
        occupied,
        capacity: svc.item.capacity ?? 1,
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

    // --- Admin identity / command audit (staff only; no customer actor required) ---
    if (
      command === "booking.admin_list_identity_audit" ||
      command === "booking.admin_unmerge" ||
      command === "booking.admin_list_command_audit"
    ) {
      if (!isStaff && !isSystem) {
        return fail(command, "FORBIDDEN", "Admin actor required");
      }

      if (command === "booking.admin_list_identity_audit") {
        const contactFilter = str(slots, "contact_id");
        const limitRaw = slots.limit;
        const rows = await listIdentityAudit({
          team_id,
          contact_id: contactFilter,
          limit:
            typeof limitRaw === "number" && Number.isFinite(limitRaw)
              ? limitRaw
              : undefined,
        });
        return ok(command, {
          audit: rows.map((r) => ({
            id: r.id,
            action: r.action,
            survivor_contact_id: r.survivor_contact_id,
            merged_contact_id: r.merged_contact_id,
            actor_type: r.actor_type,
            actor_id: r.actor_id,
            token_id: r.token_id,
            created_at: r.created_at,
            can_unmerge: r.can_unmerge,
            details: r.details,
          })),
        });
      }

      if (command === "booking.admin_list_command_audit") {
        const limitRaw = slots.limit;
        const botScoped = slots.bot_scoped === true;
        const rows = await listCommandAudit({
          team_id,
          bot_id: botScoped ? bot_id : null,
          command: str(slots, "filter_command", "command_filter"),
          contact_id: str(slots, "contact_id"),
          limit:
            typeof limitRaw === "number" && Number.isFinite(limitRaw)
              ? limitRaw
              : undefined,
        });
        return ok(command, {
          audit: rows.map((r) => ({
            id: r.id,
            command: r.command,
            actor_type: r.actor_type,
            actor_id: r.actor_id,
            via: r.via,
            contact_id: r.contact_id,
            bot_id: r.bot_id,
            ok: r.ok,
            error_code: r.error_code,
            before: r.before_state,
            after: r.after_state,
            slots: r.slots_summary,
            created_at: r.created_at,
          })),
        });
      }

      if (command === "booking.admin_unmerge") {
        if (slots.confirmed !== true) {
          return fail(
            command,
            "CONFIRMATION_REQUIRED",
            "admin_unmerge requires slots.confirmed=true"
          );
        }
        const auditId = str(slots, "audit_id", "id");
        if (!auditId) {
          return fail(command, "INVALID_REQUEST", "slots.audit_id is required");
        }
        try {
          const result = await unmergeFromAudit({
            team_id,
            bot_id,
            audit_id: auditId,
            actor_type: actor.type,
            actor_id: actor.id ?? null,
          });
          await audit({
            command,
            contact_id: result.survivor_contact_id,
            before: { audit_id: auditId },
            after: result as unknown as Record<string, unknown>,
          });
          return ok(command, result);
        } catch (err) {
          if (err instanceof IdentityError) {
            return fail(command, err.code, err.message);
          }
          throw err;
        }
      }
    }

    // --- Resources (list is customer+staff; mutations staff-only) ---
    if (command.startsWith("resources.")) {
      const settings = await getBotBookingSettings({ team_id, bot_id });
      const resourcesOn = botHasShape(settings.shapes, "resources");

      if (command === "resources.list") {
        // Allow list even when shape off so admin can prep data before enable;
        // customer still sees empty when shape off (fail closed for booking path).
        if (!resourcesOn && !isStaff && !isSystem) {
          return fail(
            command,
            "SHAPE_DISABLED",
            "resources shape is not enabled for this bot"
          );
        }
        const includeInactive =
          Boolean(slots.include_inactive) && (isStaff || isSystem);
        let list = await listResources({
          team_id,
          bot_id,
          active_only: !includeInactive,
        });
        const serviceKey = str(slots, "service_id", "service_slug", "service");
        if (serviceKey) {
          const svc = resolveService(items, slots);
          if ("error" in svc) return { ...svc.error, command };
          const eligible = await listEligibleResources({
            team_id,
            bot_id,
            catalog_item_id: svc.item.id,
            active_only: !includeInactive,
          });
          list = eligible;
        }
        return ok(command, {
          resources: list.map(resourcePayload),
          shapes: normalizeShapes(settings.shapes),
          resources_enabled: resourcesOn,
        });
      }

      if (!isStaff && !isSystem) {
        return fail(command, "FORBIDDEN", "Admin actor required");
      }

      if (command === "resources.upsert") {
        const title = str(slots, "title");
        if (!title) {
          return fail(command, "INVALID_REQUEST", "title is required");
        }
        try {
          const resource = await upsertResource({
            team_id,
            bot_id,
            id: str(slots, "id", "resource_id"),
            slug: str(slots, "slug"),
            title,
            kind: str(slots, "kind"),
            sort_order:
              typeof slots.sort_order === "number" ? slots.sort_order : undefined,
            active:
              typeof slots.active === "boolean" ? slots.active : undefined,
          });
          await audit({
            command,
            after: resourcePayload(resource),
          });
          return ok(command, { resource: resourcePayload(resource) });
        } catch (err) {
          return fail(
            command,
            "INVALID_REQUEST",
            err instanceof Error ? err.message : "upsert failed"
          );
        }
      }

      if (command === "resources.set_active") {
        const idOrSlug = str(slots, "id", "resource_id", "slug", "resource_slug");
        if (!idOrSlug || typeof slots.active !== "boolean") {
          return fail(
            command,
            "INVALID_REQUEST",
            "id/slug and active (boolean) are required"
          );
        }
        try {
          const resource = await setResourceActive({
            team_id,
            bot_id,
            id_or_slug: idOrSlug,
            active: slots.active,
          });
          await audit({
            command,
            after: resourcePayload(resource),
          });
          return ok(command, { resource: resourcePayload(resource) });
        } catch {
          return fail(command, "RESOURCE_NOT_FOUND", `Unknown resource: ${idOrSlug}`);
        }
      }

      if (command === "resources.set_service_eligibility") {
        const svc = resolveService(items, slots);
        if ("error" in svc) return { ...svc.error, command };
        const idsRaw = slots.resource_ids ?? slots.resources;
        if (!Array.isArray(idsRaw)) {
          return fail(
            command,
            "INVALID_REQUEST",
            "resource_ids array is required (use [] to clear)"
          );
        }
        try {
          const resource_ids = await setServiceResources({
            team_id,
            bot_id,
            catalog_item_id: svc.item.id,
            resource_ids: idsRaw.map(String),
          });
          await audit({
            command,
            after: {
              service_id: svc.item.id,
              resource_ids,
            },
          });
          return ok(command, {
            service_id: svc.item.id,
            resource_ids,
          });
        } catch (err) {
          return fail(
            command,
            "INVALID_REQUEST",
            err instanceof Error ? err.message : "set_service_eligibility failed"
          );
        }
      }

      if (command === "resources.set_service_requirements") {
        const svc = resolveService(items, slots);
        if ("error" in svc) return { ...svc.error, command };
        const kindsRaw =
          slots.require_resource_kinds ?? slots.require_kinds ?? slots.kinds;
        if (!Array.isArray(kindsRaw)) {
          return fail(
            command,
            "INVALID_REQUEST",
            "require_resource_kinds array is required (e.g. [\"person\",\"room\"] or [])"
          );
        }
        try {
          const service = await setServiceRequireResourceKinds({
            team_id,
            bot_id,
            catalog_item_id: svc.item.id,
            require_resource_kinds: kindsRaw.map(String),
          });
          await audit({
            command,
            after: {
              service_id: service.id,
              require_resource_kinds: service.require_resource_kinds,
            },
          });
          return ok(command, {
            service: {
              id: service.id,
              slug: service.slug,
              title: service.title,
              require_resource_kinds: service.require_resource_kinds,
            },
          });
        } catch (err) {
          return fail(
            command,
            "INVALID_REQUEST",
            err instanceof Error
              ? err.message
              : "set_service_requirements failed"
          );
        }
      }

      return fail(command, "UNKNOWN_COMMAND", `Unknown command: ${command}`);
    }

    // --- Admin catalog / hours (staff only; no customer identity) ---
    if (command.startsWith("catalog.") || command.startsWith("availability.")) {
      if (!isStaff && !isSystem) {
        return fail(command, "FORBIDDEN", "Admin actor required");
      }

      if (command === "availability.set_settings") {
        try {
          const shapesRaw = slots.shapes;
          const settings = await upsertBotBookingSettings({
            team_id,
            bot_id,
            timezone: str(slots, "timezone") ?? undefined,
            booking_horizon_days:
              typeof slots.booking_horizon_days === "number"
                ? slots.booking_horizon_days
                : undefined,
            min_notice_minutes:
              typeof slots.min_notice_minutes === "number"
                ? slots.min_notice_minutes
                : undefined,
            slot_step_minutes:
              typeof slots.slot_step_minutes === "number"
                ? slots.slot_step_minutes
                : undefined,
            shapes: Array.isArray(shapesRaw)
              ? shapesRaw.map(String)
              : undefined,
          });
          await audit({
            command,
            after: {
              timezone: settings.timezone,
              shapes: settings.shapes,
              booking_horizon_days: settings.booking_horizon_days,
              min_notice_minutes: settings.min_notice_minutes,
              slot_step_minutes: settings.slot_step_minutes,
            },
          });
          return ok(command, { settings });
        } catch (err) {
          return fail(
            command,
            "INVALID_REQUEST",
            err instanceof Error ? err.message : "set_settings failed"
          );
        }
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
          await audit({
            command,
            after: {
              service_id: service.id,
              slug: service.slug,
              title: service.title,
              active: service.active,
            },
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
          await audit({
            command,
            before: { id_or_slug: idOrSlug, active: !slots.active },
            after: {
              service_id: service.id,
              slug: service.slug,
              active: service.active,
            },
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
        await audit({
          command,
          after: { ordered_ids: ordered.map(String) },
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
          const prior = await listHours({ team_id, bot_id });
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
          await audit({
            command,
            before: { hours: prior },
            after: { hours },
          });
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
          await audit({
            command,
            after: { exception },
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
          await audit({ command, after: { block } });
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
        await audit({
          command,
          before: { block_id: blockId },
          after: { removed: true },
        });
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
    // Scope: customers may only act as their claim-resolved identity.
    // Staff/system may pass slots.contact_id for any team contact.
    // A staff delete identifies the booking itself; it must not require a
    // customer identity or create a contact as a side effect.
    if (command === "booking.admin_delete") {
      if (!isStaff && !isSystem) {
        return fail(command, "FORBIDDEN", "Admin actor required");
      }
      if (slots.confirmed !== true) {
        return fail(
          command,
          "CONFIRMATION_REQUIRED",
          "admin_delete requires slots.confirmed=true"
        );
      }
      const deleteId = str(slots, "booking_id", "id");
      if (!deleteId) {
        return fail(command, "BOOKING_ID_REQUIRED", "booking_id is required");
      }
      const target = await getBookingById({
        team_id,
        bot_id,
        booking_id: deleteId,
      });
      if (!target) {
        return fail(command, "BOOKING_NOT_FOUND", "No matching booking");
      }
      const removed = await deleteBooking({
        team_id,
        bot_id,
        booking_id: deleteId,
      });
      if (!removed) {
        return fail(command, "DELETE_FAILED", "Booking was not deleted");
      }
      await audit({
        command,
        contact_id: target.contact_id,
        before: {
          booking_id: target.id,
          status: target.status,
          starts_at: target.starts_at,
        },
        after: { deleted: true, booking_id: target.id },
      });
      return ok(command, {
        contact_id: target.contact_id,
        deleted: true,
        booking: {
          id: target.id,
          status: target.status,
          starts_at: target.starts_at,
        },
      });
    }

    const slotContactId = str(slots, "contact_id");
    const claims = body.identity_claims ?? [];
    const hasClaimsOrConversation =
      claims.length > 0 || Boolean(body.conversation_id);

    async function resolveFromClaims(): Promise<string> {
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
      return contact.id;
    }

    let contactId: string;
    if (!isStaff && !isSystem) {
      if (!hasClaimsOrConversation) {
        return fail(
          command,
          "IDENTITY_REQUIRED",
          "Customers must provide identity_claims or conversation_id"
        );
      }
      const claimContactId = await resolveFromClaims();
      if (slotContactId) {
        const slotSurvivor = await resolveSurvivorContactId({
          team_id,
          contact_id: slotContactId,
        });
        const claimSurvivor = await resolveSurvivorContactId({
          team_id,
          contact_id: claimContactId,
        });
        if (slotSurvivor !== claimSurvivor) {
          return fail(
            command,
            "FORBIDDEN",
            "Customers may only act on their own contact"
          );
        }
      }
      contactId = claimContactId;
    } else if (slotContactId) {
      const contact = await getContactById({
        team_id,
        contact_id: slotContactId,
      });
      if (!contact) {
        return fail(
          command,
          "CONTACT_NOT_FOUND",
          `Unknown contact: ${slotContactId}`
        );
      }
      contactId = slotContactId;
      await enrichContactDisplay({
        team_id,
        contact_id: contactId,
        name: body.contact_profile?.name,
        email: body.contact_profile?.email,
      });
    } else if (hasClaimsOrConversation) {
      contactId = await resolveFromClaims();
    } else {
      return fail(
        command,
        "IDENTITY_REQUIRED",
        "Provide identity_claims, conversation_id, or slots.contact_id"
      );
    }

    if (command === "booking.create_connect_token") {
      const issued = await createConnectToken({
        team_id,
        bot_id,
        contact_id: contactId,
      });
      const urlBase = process.env.BOOKING_CONNECT_URL_BASE?.trim();
      await audit({
        command,
        contact_id: contactId,
        after: { expires_at: issued.expires_at, has_connect_url: Boolean(urlBase) },
      });
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
      const open = await listOpenBookings({
        team_id,
        bot_id,
        contact_id: profile.contact.id,
      });
      return ok(command, {
        contact: {
          id: profile.contact.id,
          name: profile.contact.name,
          email: profile.contact.email,
          phone: profile.contact.phone,
        },
        bindings: profile.bindings,
        upcoming_bookings: open.map((b) =>
          serializeCustomerBooking(b, items, timezone)
        ),
        upcoming_count: open.length,
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
        await audit({
          command,
          contact_id: redeemed.survivor_contact_id,
          before: { redeeming_contact_id: contactId },
          after: {
            survivor_contact_id: redeemed.survivor_contact_id,
            merged_contact_id: redeemed.merged_contact_id,
            already_linked: redeemed.already_linked,
          },
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
      const open = await listOpenBookings({
        team_id,
        bot_id,
        contact_id: contactId,
      });
      const bookings = open.map((b) =>
        serializeCustomerBooking(b, items, timezone)
      );
      return ok(command, {
        contact_id: contactId,
        /** Next upcoming (compat for older concierge prompts). */
        booking: bookings[0] ?? null,
        bookings,
        upcoming_count: bookings.length,
      });
    }

    if (command === "booking.create") {
      const svc = resolveService(items, slots);
      if ("error" in svc) return { ...svc.error, command };
      const createSettings = await getBotBookingSettings({ team_id, bot_id });
      const createTz = createSettings.timezone || timezone;
      let stayCreate = isStayAvailabilityRequest(slots, createSettings.shapes);
      // Offered stay slots include ends_at even when check_in was omitted on create.
      if (
        !stayCreate &&
        botHasShape(createSettings.shapes, "stays") &&
        str(slots, "ends_at", "end_at")
      ) {
        stayCreate = true;
      }

      let startsAt = str(slots, "starts_at", "start_at", "slot");
      let endsAt: string | null = str(slots, "ends_at", "end_at");
      if (stayCreate) {
        if (!botHasShape(createSettings.shapes, "stays")) {
          return fail(
            command,
            "SHAPE_DISABLED",
            "stays shape is not enabled for this bot"
          );
        }
        const checkIn = str(slots, "check_in", "checkin", "arrival");
        const checkOut = str(slots, "check_out", "checkout", "departure");
        if (checkIn && checkOut) {
          const start = stayDateToUtc(checkIn, createTz);
          const end = stayDateToUtc(checkOut, createTz);
          if (!start || !end || nightsBetween(checkIn, checkOut) < 1) {
            return fail(
              command,
              "INVALID_REQUEST",
              "check_in and check_out must be YYYY-MM-DD with at least 1 night"
            );
          }
          startsAt = start.toISOString();
          endsAt = end.toISOString();
        } else if (startsAt && endsAt) {
          // offered slot ISO pair
        } else {
          return fail(
            command,
            "INVALID_REQUEST",
            "stays require check_in+check_out or starts_at+ends_at from get_availability"
          );
        }
      } else if (
        str(slots, "check_in", "checkin") ||
        str(slots, "check_out", "checkout") ||
        str(slots, "mode") === "stay"
      ) {
        return fail(
          command,
          "SHAPE_DISABLED",
          "stays shape is not enabled for this bot"
        );
      }

      if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) {
        return fail(command, "INVALID_REQUEST", "slots.starts_at (ISO) is required");
      }
      if (!isFuture(startsAt)) {
        return fail(command, "SLOT_IN_PAST", "starts_at must be in the future");
      }
      if (endsAt && Number.isNaN(new Date(endsAt).getTime())) {
        return fail(command, "INVALID_REQUEST", "slots.ends_at must be ISO");
      }
      if (endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
        return fail(
          command,
          "INVALID_REQUEST",
          "ends_at must be after starts_at"
        );
      }

      let resourceId: string | null = null;
      let resourceKinds: Array<{ id: string; kind: string }> | null = null;
      if (!stayCreate && botHasShape(createSettings.shapes, "resources")) {
        const eligible = await listEligibleResources({
          team_id,
          bot_id,
          catalog_item_id: svc.item.id,
          active_only: true,
        });
        if (eligible.length === 0) {
          return fail(
            command,
            "NO_ELIGIBLE_RESOURCES",
            "No resources are linked to this service"
          );
        }
        const resolved = await resolveResourceFromSlots({
          team_id,
          bot_id,
          slots,
          eligible,
        });
        if ("error" in resolved) return { ...resolved.error, command };
        const requireKinds = svc.item.require_resource_kinds ?? [];
        const occupiedByResource = new Map<
          string,
          Awaited<ReturnType<typeof listOccupiedIntervals>>
        >();
        for (const r of eligible) {
          occupiedByResource.set(
            r.id,
            await listOccupiedIntervals({
              team_id,
              bot_id,
              resource_id: r.id,
            })
          );
        }

        if (requireKinds.length >= 2) {
          const assigned = assignLinkedResourcesAt({
            starts_at: startsAt,
            durationMinutes: svc.item.duration_minutes,
            bufferBeforeMinutes: svc.item.buffer_before_minutes ?? 0,
            bufferAfterMinutes: svc.item.buffer_after_minutes ?? 0,
            eligible,
            requireKinds,
            occupiedByResource,
            pinnedResourceIds: resolved.pinned.map((p) => p.id),
          });
          if (!assigned) {
            return fail(command, "SLOT_TAKEN", "That time was just taken");
          }
          resourceKinds = assigned.map((r) => ({ id: r.id, kind: r.kind }));
          resourceId =
            assigned.find((r) => r.kind === "person")?.id ?? assigned[0]!.id;
        } else {
          const pool = resolved.resource ? [resolved.resource] : eligible;
          let picked: DbResource | null = resolved.resource;
          if (!picked) {
            for (const r of pool) {
              if (
                isResourceFreeAt({
                  starts_at: startsAt,
                  durationMinutes: svc.item.duration_minutes,
                  bufferBeforeMinutes: svc.item.buffer_before_minutes ?? 0,
                  bufferAfterMinutes: svc.item.buffer_after_minutes ?? 0,
                  occupied: occupiedByResource.get(r.id) ?? [],
                })
              ) {
                picked = r;
                break;
              }
            }
          } else if (
            !isResourceFreeAt({
              starts_at: startsAt,
              durationMinutes: svc.item.duration_minutes,
              bufferBeforeMinutes: svc.item.buffer_before_minutes ?? 0,
              bufferAfterMinutes: svc.item.buffer_after_minutes ?? 0,
              occupied: occupiedByResource.get(picked.id) ?? [],
            })
          ) {
            return fail(command, "SLOT_TAKEN", "That time was just taken");
          }
          if (!picked) {
            return fail(command, "SLOT_TAKEN", "That time was just taken");
          }
          resourceId = picked.id;
          resourceKinds = [{ id: picked.id, kind: picked.kind }];
        }
      } else if (
        !stayCreate &&
        (str(slots, "resource_id", "resource_slug", "resource", "room_id", "room_slug") ||
          str(slots, "resource_preference") === "specific")
      ) {
        return fail(
          command,
          "SHAPE_DISABLED",
          "resources shape is not enabled for this bot"
        );
      }
      const session = await getOrCreateSession({
        team_id,
        bot_id,
        contact_id: contactId,
        conversation_id: body.conversation_id ?? null,
        timezone: createTz,
      });
      try {
        const booking = await createBooking({
          team_id,
          bot_id,
          contact_id: contactId,
          session_id: session.id,
          catalog_item_id: svc.item.id,
          starts_at: new Date(startsAt).toISOString(),
          ends_at: endsAt ? new Date(endsAt).toISOString() : null,
          timezone: createTz,
          resource_id: resourceId,
          resource_kinds: resourceKinds,
        });
        await audit({
          command,
          contact_id: contactId,
          after: {
            booking_id: booking.id,
            status: booking.status,
            starts_at: booking.starts_at,
            ends_at: booking.ends_at ?? null,
            catalog_item_id: booking.catalog_item_id,
            resource_id: booking.resource_id ?? null,
            resources: resourceKinds,
          },
        });
        notifyCustomer("created", {
          contact_id: contactId,
          starts_at: booking.starts_at,
          timezone: booking.timezone,
          catalog_item_id: booking.catalog_item_id,
        });
        return ok(command, {
          contact_id: contactId,
          booking: {
            id: booking.id,
            booking_ref: shortBookingRef(booking.id),
            status: booking.status,
            starts_at: booking.starts_at,
            ends_at: booking.ends_at ?? null,
            timezone: booking.timezone,
            catalog_item_id: booking.catalog_item_id,
            resource_id: booking.resource_id ?? null,
            resources: resourceKinds,
            shape: stayCreate || booking.ends_at ? "stays" : "appointments",
          },
        });
      } catch (err) {
        if (err instanceof SlotConflictError) {
          return fail(command, "SLOT_TAKEN", "That time was just taken");
        }
        throw err;
      }
    }

    // Staff: mark no-show (allowed for past appointments; frees capacity).
    if (command === "booking.mark_no_show") {
      if (!isStaff && !isSystem) {
        return fail(command, "FORBIDDEN", "Admin actor required");
      }
      if (slots.confirmed !== true) {
        return fail(
          command,
          "CONFIRMATION_REQUIRED",
          "mark_no_show requires slots.confirmed=true"
        );
      }
      const noShowId = str(slots, "booking_id", "id");
      const target = noShowId
        ? await getBookingById({ team_id, bot_id, booking_id: noShowId })
        : await getLatestOpenBooking({ team_id, bot_id, contact_id: contactId });
      if (!target) {
        return fail(command, "BOOKING_NOT_FOUND", "No matching booking");
      }
      if (target.status !== "pending" && target.status !== "confirmed") {
        return fail(command, "BOOKING_NOT_ACTIVE", `Booking is ${target.status}`);
      }
      const marked = await markBookingNoShow({
        booking_id: target.id,
        notes: `no-show via commands API (${actor.type})`,
      });
      if (!marked || marked.status !== "no_show") {
        return fail(
          command,
          "NO_SHOW_FAILED",
          "Booking was not marked no-show (it may have already changed)"
        );
      }
      await audit({
        command,
        contact_id: target.contact_id ?? contactId,
        before: {
          booking_id: target.id,
          status: target.status,
          starts_at: target.starts_at,
        },
        after: {
          booking_id: target.id,
          status: marked.status,
        },
      });
      notifyCustomer("no_show", {
        contact_id: target.contact_id ?? contactId,
        starts_at: target.starts_at,
        timezone: target.timezone,
        catalog_item_id: target.catalog_item_id,
      });
      return ok(command, {
        contact_id: contactId,
        booking: {
          id: marked.id,
          status: marked.status,
          starts_at: marked.starts_at,
        },
      });
    }

    // cancel / reschedule share booking resolution + confirmation gate.
    const bookingId = str(slots, "booking_id", "id", "booking_ref");
    let existing: DbBooking | null = null;
    if (bookingId && isShortBookingRef(bookingId)) {
      existing = await findOpenBookingByShortRef({
        team_id,
        booking_ref: bookingId,
        contact_id: isStaff ? null : contactId,
        bot_id: isStaff ? null : bot_id,
      });
    } else if (bookingId) {
      existing = await getBookingById({ team_id, bot_id, booking_id: bookingId });
    } else {
      existing = await getLatestOpenBooking({
        team_id,
        bot_id,
        contact_id: contactId,
      });
    }
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
      if (!cancelled || cancelled.status !== "cancelled") {
        return fail(
          command,
          "CANCEL_FAILED",
          "Booking was not cancelled (it may have already changed)"
        );
      }
      await audit({
        command,
        contact_id: existing.contact_id ?? contactId,
        before: {
          booking_id: existing.id,
          status: existing.status,
          starts_at: existing.starts_at,
        },
        after: {
          booking_id: existing.id,
          status: cancelled.status,
        },
      });
      notifyCustomer("cancelled", {
        contact_id: existing.contact_id ?? contactId,
        starts_at: existing.starts_at,
        timezone: existing.timezone,
        catalog_item_id: existing.catalog_item_id,
      });
      return ok(command, {
        contact_id: contactId,
        booking: {
          id: cancelled.id,
          status: cancelled.status,
          starts_at: cancelled.starts_at,
        },
      });
    }

    // booking.reschedule: create the new booking first so a conflict
    // never loses the original appointment. Default service to the
    // existing booking when the catalog has multiple services.
    const svc = existing.catalog_item_id
      ? (() => {
          const item = items.find((i) => i.id === existing.catalog_item_id);
          if (item) return { item };
          return resolveService(items, slots);
        })()
      : resolveService(items, slots);
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
    const rescheduleSettings = await getBotBookingSettings({ team_id, bot_id });
    let rescheduleResourceId: string | null = existing.resource_id ?? null;
    if (botHasShape(rescheduleSettings.shapes, "resources")) {
      const eligible = await listEligibleResources({
        team_id,
        bot_id,
        catalog_item_id: svc.item.id,
        active_only: true,
      });
      if (eligible.length === 0) {
        return fail(
          command,
          "NO_ELIGIBLE_RESOURCES",
          "No resources are linked to this service"
        );
      }
      const resolved = await resolveResourceFromSlots({
        team_id,
        bot_id,
        slots,
        eligible,
      });
      if ("error" in resolved) return { ...resolved.error, command };
      if (resolved.resource) {
        rescheduleResourceId = resolved.resource.id;
      } else if (!rescheduleResourceId) {
        // Prefer keeping previous resource; else assign first free at new time.
        for (const r of eligible) {
          const occupied = await listOccupiedIntervals({
            team_id,
            bot_id,
            resource_id: r.id,
          });
          if (
            isResourceFreeAt({
              starts_at: newStart,
              durationMinutes: svc.item.duration_minutes,
              bufferBeforeMinutes: svc.item.buffer_before_minutes ?? 0,
              bufferAfterMinutes: svc.item.buffer_after_minutes ?? 0,
              occupied,
            })
          ) {
            rescheduleResourceId = r.id;
            break;
          }
        }
      }
      if (!rescheduleResourceId) {
        return fail(command, "SLOT_TAKEN", "That time was just taken");
      }
    }
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
        resource_id: rescheduleResourceId,
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
    await audit({
      command,
      contact_id: existing.contact_id ?? contactId,
      before: {
        booking_id: existing.id,
        status: existing.status,
        starts_at: existing.starts_at,
      },
      after: {
        previous_status: cancelled?.status ?? "cancelled",
        booking_id: created.id,
        status: created.status,
        starts_at: created.starts_at,
      },
    });
    notifyCustomer("rescheduled", {
      contact_id: existing.contact_id ?? contactId,
      starts_at: created.starts_at,
      previous_starts_at: existing.starts_at,
      timezone: created.timezone,
      catalog_item_id: created.catalog_item_id ?? existing.catalog_item_id,
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
