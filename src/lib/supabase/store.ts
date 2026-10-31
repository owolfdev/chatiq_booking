import type { IdentityBindingClaim } from "@/lib/contract";

import { createBookingAdminClient } from "./admin";
import { ensurePilotCatalogIfEmpty, listCatalogServices } from "./catalog";

export type DbContact = {
  id: string;
  team_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  created_at?: string;
  merged_into?: string | null;
};

export type DbSession = {
  id: string;
  team_id: string;
  bot_id: string;
  contact_id: string;
  conversation_id: string | null;
  step: string;
  timezone: string;
};

export async function probeSupabasePersistence(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const supabase = createBookingAdminClient();
  if (!supabase) {
    return { ok: false, error: "supabase_not_configured" };
  }

  const { error } = await supabase.from("contacts").select("id").limit(1);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

function normalizeProfileText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isPlaceholderContactName(name: string | null | undefined): boolean {
  const n = normalizeProfileText(name);
  return !n || n.toLowerCase() === "guest";
}

/**
 * Fill display fields on a contact when we learn them from a channel.
 * Display only — never used as merge keys. Fills blanks / "Guest"; does not
 * overwrite a real name or email already stored.
 */
export async function enrichContactDisplay(input: {
  team_id: string;
  contact_id: string;
  name?: string | null;
  email?: string | null;
}): Promise<DbContact | null> {
  const supabase = createBookingAdminClient();
  if (!supabase) return null;

  const hintName = normalizeProfileText(input.name);
  const hintEmail = normalizeProfileText(input.email)?.toLowerCase() ?? null;
  if (!hintName && !hintEmail) return null;

  let contact = await getContactById({
    team_id: input.team_id,
    contact_id: input.contact_id,
  });
  if (!contact) return null;

  // Prefer the surviving customer after a merge.
  if (contact.merged_into) {
    const survivor = await getContactById({
      team_id: input.team_id,
      contact_id: contact.merged_into,
    });
    if (survivor) contact = survivor;
  }

  const patch: { name?: string; email?: string; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (hintName && isPlaceholderContactName(contact.name)) {
    patch.name = hintName;
  }
  if (hintEmail && !normalizeProfileText(contact.email)) {
    patch.email = hintEmail;
  }
  if (!patch.name && !patch.email) {
    return contact;
  }

  const { data: updated, error } = await supabase
    .from("contacts")
    .update(patch)
    .eq("id", contact.id)
    .select("id, team_id, name, email, phone, created_at, merged_into")
    .single();
  if (error) {
    throw new Error(`contacts enrich failed: ${error.message}`);
  }
  return (updated as DbContact) ?? contact;
}

export async function resolveOrCreateContact(input: {
  team_id: string;
  claims?: IdentityBindingClaim[];
  name?: string | null;
  email?: string | null;
}): Promise<DbContact> {
  const supabase = createBookingAdminClient();
  if (!supabase) {
    throw new Error("Supabase not configured");
  }

  // Deduplicate by (provider, external_id) — callers sometimes pass the
  // same claim twice (e.g. conversation_id + matching identity claim).
  const claims: IdentityBindingClaim[] = [];
  const seen = new Set<string>();
  for (const c of input.claims ?? []) {
    const provider = c.provider?.trim();
    const external_id = c.external_id?.trim();
    if (!provider || !external_id) continue;
    const key = `${provider}\0${external_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    claims.push({ ...c, provider, external_id });
  }

  // Prefer strong channel accounts over weak conversation continuity.
  // Otherwise a post-link web thread that also sends web_user still matches
  // the orphan chatiq_conversation contact created before the session was
  // attached, and "my bookings" stays empty.
  const claimStrength = (provider: string): number => {
    if (
      provider === "web_user" ||
      provider === "line" ||
      provider === "instagram"
    ) {
      return 3;
    }
    if (provider === "channel_user") return 2;
    if (provider === "chatiq_conversation") return 1;
    return 0;
  };
  const orderedClaims = [...claims].sort(
    (a, b) => claimStrength(b.provider) - claimStrength(a.provider)
  );

  const createName =
    normalizeProfileText(input.name) ?? "Guest";

  for (const claim of orderedClaims) {
    const { data: binding, error: bindingError } = await supabase
      .from("identity_bindings")
      .select("contact_id")
      .eq("team_id", input.team_id)
      .eq("provider", claim.provider)
      .eq("external_id", claim.external_id)
      .maybeSingle();

    if (bindingError) {
      throw new Error(`identity_bindings lookup failed: ${bindingError.message}`);
    }
    if (binding?.contact_id) {
      const { data: contact, error: contactError } = await supabase
        .from("contacts")
        .select("id, team_id, name, email, phone, created_at, merged_into")
        .eq("id", binding.contact_id)
        .maybeSingle();
      if (contactError) {
        throw new Error(`contacts lookup failed: ${contactError.message}`);
      }
      if (contact) {
        const enriched = await enrichContactDisplay({
          team_id: input.team_id,
          contact_id: contact.id,
          name: input.name,
          email: input.email,
        });
        return (enriched ?? (contact as DbContact)) as DbContact;
      }
    }
  }

  const { data: created, error: createError } = await supabase
    .from("contacts")
    .insert({
      team_id: input.team_id,
      name: createName,
      email: normalizeProfileText(input.email)?.toLowerCase() ?? null,
    })
    .select("id, team_id, name, email, phone, created_at, merged_into")
    .single();

  if (createError || !created) {
    throw new Error(
      `contacts insert failed: ${createError?.message ?? "unknown"}`
    );
  }

  if (claims.length > 0) {
    const { error: bindError } = await supabase.from("identity_bindings").insert(
      claims.map((claim) => ({
        team_id: input.team_id,
        contact_id: created.id,
        provider: claim.provider,
        external_id: claim.external_id,
        verified: Boolean(claim.verified),
      }))
    );
    if (bindError) {
      throw new Error(`identity_bindings insert failed: ${bindError.message}`);
    }
  }

  return created as DbContact;
}

export async function getOrCreateSession(input: {
  team_id: string;
  bot_id: string;
  contact_id: string;
  conversation_id?: string | null;
  session_id?: string | null;
  timezone: string;
}): Promise<DbSession> {
  const supabase = createBookingAdminClient();
  if (!supabase) {
    throw new Error("Supabase not configured");
  }

  if (input.session_id?.trim()) {
    const { data, error } = await supabase
      .from("booking_sessions")
      .select(
        "id, team_id, bot_id, contact_id, conversation_id, step, timezone"
      )
      .eq("id", input.session_id.trim())
      .maybeSingle();
    if (error) {
      throw new Error(`booking_sessions by id failed: ${error.message}`);
    }
    if (data) {
      await supabase
        .from("booking_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", data.id);
      return data as DbSession;
    }
  }

  const conversationId = input.conversation_id?.trim() || null;
  if (conversationId) {
    const { data, error } = await supabase
      .from("booking_sessions")
      .select(
        "id, team_id, bot_id, contact_id, conversation_id, step, timezone"
      )
      .eq("team_id", input.team_id)
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (error) {
      throw new Error(
        `booking_sessions by conversation failed: ${error.message}`
      );
    }
    if (data) {
      await supabase
        .from("booking_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", data.id);
      return data as DbSession;
    }
  }

  const { data: created, error: createError } = await supabase
    .from("booking_sessions")
    .insert({
      team_id: input.team_id,
      bot_id: input.bot_id,
      contact_id: input.contact_id,
      conversation_id: conversationId,
      step: "stub_welcome",
      timezone: input.timezone,
    })
    .select("id, team_id, bot_id, contact_id, conversation_id, step, timezone")
    .single();

  if (createError || !created) {
    throw new Error(
      `booking_sessions insert failed: ${createError?.message ?? "unknown"}`
    );
  }

  return created as DbSession;
}

export type DbCatalogItem = {
  id: string;
  slug: string;
  title: string;
  duration_minutes: number;
  active: boolean;
  description?: string | null;
  category?: string | null;
  sort_order?: number;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  capacity?: number;
  max_guests?: number;
  price_cents?: number | null;
  currency?: string | null;
  booking_horizon_days?: number | null;
  min_notice_minutes?: number | null;
  require_resource_kinds?: string[];
};

/** Active catalog items for a team/bot (seeds Consultation only when empty). */
export async function listCatalogItems(input: {
  team_id: string;
  bot_id: string;
}): Promise<DbCatalogItem[]> {
  await ensurePilotCatalogIfEmpty(input);
  const rows = await listCatalogServices({ ...input, active_only: true });
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    duration_minutes: r.duration_minutes,
    active: r.active,
    description: r.description,
    category: r.category,
    sort_order: r.sort_order,
    buffer_before_minutes: r.buffer_before_minutes,
    buffer_after_minutes: r.buffer_after_minutes,
    capacity: r.capacity,
    max_guests: r.max_guests,
    price_cents: r.price_cents,
    currency: r.currency,
    booking_horizon_days: r.booking_horizon_days,
    min_notice_minutes: r.min_notice_minutes,
    require_resource_kinds: r.require_resource_kinds ?? [],
  }));
}

/** Seeds Consultation only when the bot catalog is empty. */
export async function ensurePilotCatalogItem(input: {
  team_id: string;
  bot_id: string;
}): Promise<{ id: string; slug: string; title: string } | null> {
  const row = await ensurePilotCatalogIfEmpty(input);
  return row ? { id: row.id, slug: row.slug, title: row.title } : null;
}

export async function getContactById(input: {
  team_id: string;
  contact_id: string;
}): Promise<DbContact | null> {
  const supabase = createBookingAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("contacts")
    .select("id, team_id, name, email, phone, created_at, merged_into")
    .eq("team_id", input.team_id)
    .eq("id", input.contact_id)
    .maybeSingle();
  if (error) {
    throw new Error(`contacts by id failed: ${error.message}`);
  }
  return (data as DbContact | null) ?? null;
}

export async function getBookingById(input: {
  team_id: string;
  bot_id: string;
  booking_id: string;
}): Promise<DbBooking | null> {
  const supabase = createBookingAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, status, starts_at, ends_at, timezone, catalog_item_id, resource_id, contact_id, guest_count"
    )
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id)
    .eq("id", input.booking_id)
    .maybeSingle();
  if (error) {
    throw new Error(`bookings by id failed: ${error.message}`);
  }
  return (data as DbBooking | null) ?? null;
}

const SHORT_BOOKING_REF_RE = /^[0-9a-f]{8}$/i;

/** True for the 8-char guest/staff schedule Id prefix (not a full UUID). */
export function isShortBookingRef(value: string): boolean {
  return SHORT_BOOKING_REF_RE.test(value.trim());
}

/**
 * Resolve guest-facing booking_ref (first 8 of UUID) to an open booking.
 * Contact-scoped for customers; team-scoped when contact_id omitted (staff).
 */
export async function findOpenBookingByShortRef(input: {
  team_id: string;
  booking_ref: string;
  contact_id?: string | null;
  bot_id?: string | null;
}): Promise<DbBooking | null> {
  const ref = input.booking_ref.trim().toLowerCase();
  if (!isShortBookingRef(ref)) return null;
  const supabase = createBookingAdminClient();
  if (!supabase) return null;
  let query = supabase
    .from("bookings")
    .select(
      "id, status, starts_at, ends_at, timezone, catalog_item_id, resource_id, contact_id, guest_count"
    )
    .eq("team_id", input.team_id)
    .in("status", ["pending", "confirmed"])
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(25);
  if (input.contact_id) query = query.eq("contact_id", input.contact_id);
  if (input.bot_id) query = query.eq("bot_id", input.bot_id);
  const { data, error } = await query;
  if (error) {
    throw new Error(`bookings short-ref lookup failed: ${error.message}`);
  }
  const match = (data ?? []).find(
    (row) => typeof row.id === "string" && row.id.toLowerCase().startsWith(ref)
  );
  return (match as DbBooking | null) ?? null;
}

export async function updateSessionStep(
  sessionId: string,
  step: string
): Promise<void> {
  const supabase = createBookingAdminClient();
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase
    .from("booking_sessions")
    .update({ step, updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) {
    throw new Error(`booking_sessions step update failed: ${error.message}`);
  }
}

export async function listTakenStarts(input: {
  team_id: string;
  bot_id: string;
}): Promise<Set<string>> {
  const occupied = await listOccupiedIntervals(input);
  return new Set(occupied.map((o) => new Date(o.starts_at).toISOString()));
}

/** Occupied intervals for capacity/buffer-aware slot search. */
export async function listOccupiedIntervals(input: {
  team_id: string;
  bot_id: string;
  /** When set, only bookings for this resource (resources shape). */
  resource_id?: string | null;
  /** When true, only bookings that have no resource_id (legacy shared calendar). */
  unassigned_only?: boolean;
}): Promise<Array<{ starts_at: string; ends_at: string }>> {
  const supabase = createBookingAdminClient();
  if (!supabase) return [];
  type OccRow = {
    id: string;
    starts_at: string;
    catalog_item_id: string | null;
    resource_id: string | null;
  };
  const byBooking = new Map<string, OccRow>();

  const loadBookingsByIds = async (ids: string[]) => {
    const unique = [...new Set(ids)].filter(Boolean);
    if (unique.length === 0) return;
    const { data: rows, error: loadErr } = await supabase
      .from("bookings")
      .select("id, starts_at, catalog_item_id, resource_id")
      .eq("team_id", input.team_id)
      .eq("bot_id", input.bot_id)
      .in("status", ["pending", "confirmed"])
      .in("id", unique)
      .not("starts_at", "is", null);
    if (loadErr) {
      console.warn("[booking] listOccupiedIntervals load failed", loadErr.message);
      return;
    }
    for (const row of rows ?? []) {
      if (typeof row.starts_at !== "string" || typeof row.id !== "string") continue;
      byBooking.set(row.id, row as OccRow);
    }
  };

  if (input.resource_id && !input.unassigned_only) {
    const resourceId = input.resource_id;
    const { data: primary } = await supabase
      .from("bookings")
      .select("id")
      .eq("team_id", input.team_id)
      .eq("bot_id", input.bot_id)
      .eq("resource_id", resourceId)
      .in("status", ["pending", "confirmed"]);
    const { data: links } = await supabase
      .from("booking_resources")
      .select("booking_id")
      .eq("resource_id", resourceId);
    await loadBookingsByIds([
      ...(primary ?? []).map((r) => r.id as string),
      ...(links ?? []).map((l) => l.booking_id as string),
    ]);
  } else {
    let query = supabase
      .from("bookings")
      .select("id, starts_at, catalog_item_id, resource_id")
      .eq("team_id", input.team_id)
      .eq("bot_id", input.bot_id)
      .in("status", ["pending", "confirmed"])
      .not("starts_at", "is", null);
    if (input.unassigned_only) {
      query = query.is("resource_id", null);
    }
    const { data, error } = await query;
    if (error) {
      console.warn("[booking] listOccupiedIntervals failed", error.message);
      return [];
    }
    for (const row of data ?? []) {
      if (typeof row.starts_at !== "string" || typeof row.id !== "string") continue;
      byBooking.set(row.id, row as OccRow);
    }
  }

  const rows = [...byBooking.values()];
  const catalogIds = [
    ...new Set(
      rows
        .map((r) => r.catalog_item_id)
        .filter((id): id is string => typeof id === "string")
    ),
  ];
  const meta = new Map<
    string,
    { duration: number; before: number; after: number }
  >();
  if (catalogIds.length > 0) {
    const { data: items } = await supabase
      .from("catalog_items")
      .select("id, duration_minutes, buffer_before_minutes, buffer_after_minutes")
      .in("id", catalogIds);
    for (const item of items ?? []) {
      meta.set(item.id, {
        duration: item.duration_minutes ?? 30,
        before: item.buffer_before_minutes ?? 0,
        after: item.buffer_after_minutes ?? 0,
      });
    }
  }
  const out: Array<{ starts_at: string; ends_at: string }> = [];
  for (const row of rows) {
    const m = row.catalog_item_id
      ? meta.get(row.catalog_item_id)
      : undefined;
    const duration = m?.duration ?? 30;
    const before = m?.before ?? 0;
    const after = m?.after ?? 0;
    const startMs = new Date(row.starts_at).getTime() - before * 60_000;
    const endMs =
      new Date(row.starts_at).getTime() + (duration + after) * 60_000;
    out.push({
      starts_at: new Date(startMs).toISOString(),
      ends_at: new Date(endMs).toISOString(),
    });
  }
  return out;
}

export type DbBooking = {
  id: string;
  status: string;
  starts_at: string | null;
  ends_at?: string | null;
  timezone: string;
  catalog_item_id: string | null;
  resource_id?: string | null;
  contact_id?: string;
  guest_count?: number | null;
};

/**
 * The contact's next upcoming open booking.
 * Must filter `starts_at >= now`: without it, a past confirmed booking is
 * treated as current (blocks create, shows in lookup, offered for cancel).
 * Found in chat-smoke 2026-10-21 (expired 20 Oct booking still "upcoming").
 */
/** Upcoming open bookings for a contact (team-scoped; next first). */
export async function listOpenBookings(input: {
  team_id: string;
  bot_id: string;
  contact_id: string;
  limit?: number;
}): Promise<DbBooking[]> {
  const supabase = createBookingAdminClient();
  if (!supabase) return [];
  // Contact-scoped across bots on the team so a linked web door can find a
  // booking created on LINE (and the reverse). Slot conflict checks stay bot-scoped.
  void input.bot_id;
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, status, starts_at, ends_at, timezone, catalog_item_id, resource_id, contact_id, guest_count"
    )
    .eq("team_id", input.team_id)
    .eq("contact_id", input.contact_id)
    .in("status", ["pending", "confirmed"])
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(Math.min(50, Math.max(1, input.limit ?? 20)));
  if (error) {
    throw new Error(`bookings lookup failed: ${error.message}`);
  }
  return (data as DbBooking[]) ?? [];
}

export async function getLatestOpenBooking(input: {
  team_id: string;
  bot_id: string;
  contact_id: string;
}): Promise<DbBooking | null> {
  const rows = await listOpenBookings({ ...input, limit: 1 });
  return rows[0] ?? null;
}

/** Open stay bookings (ends_at set) for night-range capacity checks. */
export async function listStayOccupied(input: {
  team_id: string;
  bot_id: string;
  catalog_item_id?: string | null;
}): Promise<Array<{ starts_at: string; ends_at: string }>> {
  const supabase = createBookingAdminClient();
  if (!supabase) return [];
  let query = supabase
    .from("bookings")
    .select("starts_at, ends_at")
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id)
    .in("status", ["pending", "confirmed"])
    .not("starts_at", "is", null)
    .not("ends_at", "is", null);
  if (input.catalog_item_id) {
    query = query.eq("catalog_item_id", input.catalog_item_id);
  }
  const { data, error } = await query;
  if (error) {
    console.warn("[booking] listStayOccupied failed", error.message);
    return [];
  }
  return (data ?? [])
    .filter(
      (r): r is { starts_at: string; ends_at: string } =>
        typeof r.starts_at === "string" && typeof r.ends_at === "string"
    )
    .map((r) => ({ starts_at: r.starts_at, ends_at: r.ends_at }));
}

export type AdminBookingRow = {
  id: string;
  team_id: string;
  bot_id: string;
  contact_id: string;
  status: string;
  starts_at: string | null;
  timezone: string;
  created_at: string;
  catalog_item_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  service_title: string | null;
  service_slug: string | null;
  service_duration_minutes: number | null;
};

export async function listRecentBookings(input?: {
  team_id?: string;
  bot_id?: string;
  limit?: number;
  status?: string | string[];
  from?: string;
  to?: string;
}): Promise<AdminBookingRow[]> {
  const supabase = createBookingAdminClient();
  if (!supabase) return [];

  let query = supabase
    .from("bookings")
    .select(
      "id, team_id, bot_id, contact_id, status, starts_at, timezone, created_at, catalog_item_id"
    )
    .order("starts_at", { ascending: true, nullsFirst: false })
    .limit(input?.limit ?? 100);

  if (input?.team_id) query = query.eq("team_id", input.team_id);
  if (input?.bot_id) query = query.eq("bot_id", input.bot_id);
  if (input?.status) {
    const statuses = Array.isArray(input.status) ? input.status : [input.status];
    query = query.in("status", statuses);
  }
  if (input?.from) query = query.gte("starts_at", input.from);
  if (input?.to) query = query.lte("starts_at", input.to);

  const { data, error } = await query;
  if (error) {
    throw new Error(`bookings list failed: ${error.message}`);
  }
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const contactIds = [...new Set(rows.map((r) => r.contact_id).filter(Boolean))];
  const catalogIds = [
    ...new Set(
      rows
        .map((r) => r.catalog_item_id)
        .filter((id): id is string => typeof id === "string")
    ),
  ];

  const contactMap = new Map<
    string,
    { name: string | null; email: string | null }
  >();
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, name, email")
      .in("id", contactIds);
    for (const c of contacts ?? []) {
      contactMap.set(c.id, { name: c.name ?? null, email: c.email ?? null });
    }
  }

  const catalogMap = new Map<
    string,
    { title: string; slug: string; duration_minutes: number }
  >();
  if (catalogIds.length > 0) {
    const { data: items } = await supabase
      .from("catalog_items")
      .select("id, title, slug, duration_minutes")
      .in("id", catalogIds);
    for (const item of items ?? []) {
      catalogMap.set(item.id, {
        title: item.title,
        slug: item.slug,
        duration_minutes: item.duration_minutes,
      });
    }
  }

  return rows.map((r) => {
    const contact = contactMap.get(r.contact_id);
    const service = r.catalog_item_id
      ? catalogMap.get(r.catalog_item_id)
      : undefined;
    return {
      ...r,
      contact_name: contact?.name ?? null,
      contact_email: contact?.email ?? null,
      service_title: service?.title ?? null,
      service_slug: service?.slug ?? null,
      service_duration_minutes: service?.duration_minutes ?? null,
    };
  });
}

export class SlotConflictError extends Error {
  constructor(message = "That time was just taken") {
    super(message);
    this.name = "SlotConflictError";
  }
}

export async function cancelBooking(input: {
  booking_id: string;
  notes?: string;
}): Promise<DbBooking | null> {
  const supabase = createBookingAdminClient();
  if (!supabase) throw new Error("Supabase not configured");

  const { data, error } = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      notes: input.notes ?? "cancelled by customer",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.booking_id)
    .in("status", ["pending", "confirmed"])
    .select("id, status, starts_at, timezone, catalog_item_id")
    .maybeSingle();

  if (error) {
    throw new Error(`bookings cancel failed: ${error.message}`);
  }
  return (data as DbBooking | null) ?? null;
}

/** Mark an open booking as no-show (staff). Frees capacity like cancel. */
export async function markBookingNoShow(input: {
  booking_id: string;
  notes?: string;
}): Promise<DbBooking | null> {
  const supabase = createBookingAdminClient();
  if (!supabase) throw new Error("Supabase not configured");

  const { data, error } = await supabase
    .from("bookings")
    .update({
      status: "no_show",
      notes: input.notes ?? "marked no-show",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.booking_id)
    .in("status", ["pending", "confirmed"])
    .select("id, status, starts_at, timezone, catalog_item_id, contact_id")
    .maybeSingle();

  if (error) {
    throw new Error(`bookings no_show failed: ${error.message}`);
  }
  return (data as DbBooking | null) ?? null;
}

/**
 * Hard-delete a booking (staff/admin cleanup). `booking_resources` cascade.
 * Prefer cancel/no_show for normal ops; use this for smoke/test or erasure-adjacent cleanup.
 */
export async function deleteBooking(input: {
  team_id: string;
  bot_id: string;
  booking_id: string;
}): Promise<DbBooking | null> {
  const supabase = createBookingAdminClient();
  if (!supabase) throw new Error("Supabase not configured");

  const existing = await getBookingById({
    team_id: input.team_id,
    bot_id: input.bot_id,
    booking_id: input.booking_id,
  });
  if (!existing) return null;

  const { data: deleted, error } = await supabase
    .from("bookings")
    .delete()
    .eq("id", input.booking_id)
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id)
    .select("id");

  if (error) {
    throw new Error(`bookings delete failed: ${error.message}`);
  }
  if (deleted?.length !== 1 || deleted[0]?.id !== input.booking_id) {
    throw new Error("bookings delete failed: no row was removed");
  }
  const stillPresent = await getBookingById(input);
  if (stillPresent) {
    throw new Error("bookings delete failed: row is still present");
  }
  return existing;
}

export async function createBooking(input: {
  team_id: string;
  bot_id: string;
  contact_id: string;
  session_id: string;
  catalog_item_id: string | null;
  starts_at: string;
  timezone: string;
  /** When set, conflict check is scoped to this resource (capacity 1). */
  resource_id?: string | null;
  /** Multi-resource links (person+room). Primary resource_id derived if omitted. */
  resource_ids?: string[] | null;
  resource_kinds?: Array<{ id: string; kind: string }> | null;
  /** Stay check-out (exclusive). When set, night-range capacity applies. */
  ends_at?: string | null;
  /** Party size for this booking (stays occupancy). */
  guest_count?: number | null;
}): Promise<DbBooking> {
  const supabase = createBookingAdminClient();
  if (!supabase) throw new Error("Supabase not configured");

  const startsAt = new Date(input.starts_at).toISOString();
  const endsAt = input.ends_at
    ? new Date(input.ends_at).toISOString()
    : null;
  const linked =
    input.resource_kinds?.filter((r) => r.id?.trim()) ??
    (input.resource_ids ?? [])
      .filter(Boolean)
      .map((id) => ({ id: id.trim(), kind: "other" }));
  const resourceId =
    input.resource_id?.trim() ||
    linked.find((r) => r.kind === "person")?.id ||
    linked[0]?.id ||
    null;

  let capacity = 1;
  let duration = 30;
  let bufferBefore = 0;
  let bufferAfter = 0;
  const guestCount =
    typeof input.guest_count === "number" && Number.isFinite(input.guest_count)
      ? Math.max(1, Math.floor(input.guest_count))
      : null;
  if (input.catalog_item_id) {
    const { data: item } = await supabase
      .from("catalog_items")
      .select(
        "capacity, duration_minutes, buffer_before_minutes, buffer_after_minutes"
      )
      .eq("id", input.catalog_item_id)
      .maybeSingle();
    if (item) {
      capacity = Math.max(1, item.capacity ?? 1);
      duration = item.duration_minutes ?? 30;
      bufferBefore = item.buffer_before_minutes ?? 0;
      bufferAfter = item.buffer_after_minutes ?? 0;
    }
  }

  if (endsAt) {
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      throw new Error("ends_at must be after starts_at");
    }
    const occupied = await listStayOccupied({
      team_id: input.team_id,
      bot_id: input.bot_id,
      catalog_item_id: input.catalog_item_id,
    });
    const overlapping = occupied.filter((o) => {
      return (
        new Date(startsAt).getTime() < new Date(o.ends_at).getTime() &&
        new Date(o.starts_at).getTime() < new Date(endsAt).getTime()
      );
    }).length;
    if (overlapping >= capacity) {
      throw new SlotConflictError();
    }
  } else {
    // One booking per resource at a time; check every linked resource.
    const checkIds = linked.length
      ? [...new Set(linked.map((r) => r.id))]
      : resourceId
        ? [resourceId]
        : [];
    if (checkIds.length > 0) capacity = 1;

    const blockStart =
      new Date(startsAt).getTime() - bufferBefore * 60_000;
    const blockEnd =
      new Date(startsAt).getTime() + (duration + bufferAfter) * 60_000;

    if (checkIds.length === 0) {
      const occupied = await listOccupiedIntervals({
        team_id: input.team_id,
        bot_id: input.bot_id,
      });
      const overlapping = occupied.filter((o) => {
        const oStart = new Date(o.starts_at).getTime();
        const oEnd = new Date(o.ends_at).getTime();
        return blockStart < oEnd && oStart < blockEnd;
      }).length;
      if (overlapping >= capacity) {
        throw new SlotConflictError();
      }
    } else {
      for (const rid of checkIds) {
        const occupied = await listOccupiedIntervals({
          team_id: input.team_id,
          bot_id: input.bot_id,
          resource_id: rid,
        });
        const overlapping = occupied.filter((o) => {
          const oStart = new Date(o.starts_at).getTime();
          const oEnd = new Date(o.ends_at).getTime();
          return blockStart < oEnd && oStart < blockEnd;
        }).length;
        if (overlapping >= capacity) {
          throw new SlotConflictError();
        }
      }
    }
  }

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      team_id: input.team_id,
      bot_id: input.bot_id,
      contact_id: input.contact_id,
      session_id: input.session_id,
      catalog_item_id: input.catalog_item_id,
      resource_id: resourceId,
      status: "confirmed",
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: input.timezone,
      guest_count: guestCount,
    })
    .select(
      "id, status, starts_at, ends_at, timezone, catalog_item_id, resource_id, guest_count"
    )
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      throw new SlotConflictError();
    }
    throw new Error(`bookings insert failed: ${error?.message ?? "unknown"}`);
  }

  const toLink =
    linked.length > 0
      ? linked
      : resourceId
        ? [{ id: resourceId, kind: "person" }]
        : [];
  if (toLink.length > 0) {
    const { error: linkErr } = await supabase.from("booking_resources").insert(
      toLink.map((r) => ({
        booking_id: data.id,
        resource_id: r.id,
        kind: r.kind === "room" || r.kind === "other" ? r.kind : "person",
      }))
    );
    if (linkErr) {
      // Best-effort rollback so we don't leave a half-linked booking.
      await supabase.from("bookings").delete().eq("id", data.id);
      throw new Error(`booking_resources insert failed: ${linkErr.message}`);
    }
  }

  return data as DbBooking;
}
