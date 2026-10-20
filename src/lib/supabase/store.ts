import type { IdentityBindingClaim } from "@/lib/contract";

import { createBookingAdminClient } from "./admin";

export type DbContact = {
  id: string;
  team_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
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

export async function resolveOrCreateContact(input: {
  team_id: string;
  claims?: IdentityBindingClaim[];
  name?: string | null;
}): Promise<DbContact> {
  const supabase = createBookingAdminClient();
  if (!supabase) {
    throw new Error("Supabase not configured");
  }

  const claims =
    input.claims?.filter((c) => c.provider?.trim() && c.external_id?.trim()) ??
    [];

  for (const claim of claims) {
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
        .select("id, team_id, name, email, phone")
        .eq("id", binding.contact_id)
        .maybeSingle();
      if (contactError) {
        throw new Error(`contacts lookup failed: ${contactError.message}`);
      }
      if (contact) return contact as DbContact;
    }
  }

  const { data: created, error: createError } = await supabase
    .from("contacts")
    .insert({
      team_id: input.team_id,
      name: input.name ?? "Guest",
    })
    .select("id, team_id, name, email, phone")
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

export async function ensurePilotCatalogItem(input: {
  team_id: string;
  bot_id: string;
}): Promise<{ id: string; slug: string; title: string } | null> {
  const supabase = createBookingAdminClient();
  if (!supabase) return null;

  const slug = "consultation";
  const { data: existing } = await supabase
    .from("catalog_items")
    .select("id, slug, title")
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id)
    .eq("slug", slug)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("catalog_items")
    .insert({
      team_id: input.team_id,
      bot_id: input.bot_id,
      slug,
      title: "Consultation",
      duration_minutes: 30,
      active: true,
    })
    .select("id, slug, title")
    .single();

  if (error) {
    console.warn("[booking] catalog seed failed", error.message);
    return null;
  }
  return created;
}

export type DbCatalogItem = {
  id: string;
  slug: string;
  title: string;
  duration_minutes: number;
  active: boolean;
};

/** Active catalog items for a team/bot (seeds the pilot item if none). */
export async function listCatalogItems(input: {
  team_id: string;
  bot_id: string;
}): Promise<DbCatalogItem[]> {
  const supabase = createBookingAdminClient();
  if (!supabase) return [];
  await ensurePilotCatalogItem(input);
  const { data, error } = await supabase
    .from("catalog_items")
    .select("id, slug, title, duration_minutes, active")
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id)
    .eq("active", true)
    .order("title", { ascending: true });
  if (error) {
    throw new Error(`catalog list failed: ${error.message}`);
  }
  return (data ?? []) as DbCatalogItem[];
}

export async function getContactById(input: {
  team_id: string;
  contact_id: string;
}): Promise<DbContact | null> {
  const supabase = createBookingAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("contacts")
    .select("id, team_id, name, email, phone")
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
    .select("id, status, starts_at, timezone, catalog_item_id, contact_id")
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id)
    .eq("id", input.booking_id)
    .maybeSingle();
  if (error) {
    throw new Error(`bookings by id failed: ${error.message}`);
  }
  return (data as DbBooking | null) ?? null;
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
  const supabase = createBookingAdminClient();
  if (!supabase) return new Set();
  const { data, error } = await supabase
    .from("bookings")
    .select("starts_at")
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id)
    .in("status", ["pending", "confirmed"])
    .not("starts_at", "is", null);
  if (error) {
    console.warn("[booking] listTakenStarts failed", error.message);
    return new Set();
  }
  return new Set(
    (data ?? [])
      .map((row) => row.starts_at)
      .filter((v): v is string => typeof v === "string")
      .map((v) => new Date(v).toISOString())
  );
}

export type DbBooking = {
  id: string;
  status: string;
  starts_at: string | null;
  timezone: string;
  catalog_item_id: string | null;
  contact_id?: string;
};

/**
 * The contact's next upcoming open booking.
 * Must filter `starts_at >= now`: without it, a past confirmed booking is
 * treated as current (blocks create, shows in lookup, offered for cancel).
 * Found in chat-smoke 2026-10-21 (expired 20 Oct booking still "upcoming").
 */
export async function getLatestOpenBooking(input: {
  team_id: string;
  bot_id: string;
  contact_id: string;
}): Promise<DbBooking | null> {
  const supabase = createBookingAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("bookings")
    .select("id, status, starts_at, timezone, catalog_item_id")
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id)
    .eq("contact_id", input.contact_id)
    .in("status", ["pending", "confirmed"])
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`bookings lookup failed: ${error.message}`);
  }
  return (data as DbBooking | null) ?? null;
}

export async function listRecentBookings(input?: {
  team_id?: string;
  bot_id?: string;
  limit?: number;
}): Promise<
  Array<{
    id: string;
    team_id: string;
    bot_id: string;
    contact_id: string;
    status: string;
    starts_at: string | null;
    timezone: string;
    created_at: string;
    catalog_item_id: string | null;
  }>
> {
  const supabase = createBookingAdminClient();
  if (!supabase) return [];

  let query = supabase
    .from("bookings")
    .select(
      "id, team_id, bot_id, contact_id, status, starts_at, timezone, created_at, catalog_item_id"
    )
    .order("starts_at", { ascending: true, nullsFirst: false })
    .limit(input?.limit ?? 50);

  if (input?.team_id) query = query.eq("team_id", input.team_id);
  if (input?.bot_id) query = query.eq("bot_id", input.bot_id);

  const { data, error } = await query;
  if (error) {
    throw new Error(`bookings list failed: ${error.message}`);
  }
  return data ?? [];
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

export async function createBooking(input: {
  team_id: string;
  bot_id: string;
  contact_id: string;
  session_id: string;
  catalog_item_id: string | null;
  starts_at: string;
  timezone: string;
}): Promise<DbBooking> {
  const supabase = createBookingAdminClient();
  if (!supabase) throw new Error("Supabase not configured");

  const startsAt = new Date(input.starts_at).toISOString();

  const { data: clash, error: clashError } = await supabase
    .from("bookings")
    .select("id")
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id)
    .eq("starts_at", startsAt)
    .in("status", ["pending", "confirmed"])
    .maybeSingle();

  if (clashError) {
    throw new Error(`bookings conflict check failed: ${clashError.message}`);
  }
  if (clash) {
    throw new SlotConflictError();
  }

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      team_id: input.team_id,
      bot_id: input.bot_id,
      contact_id: input.contact_id,
      session_id: input.session_id,
      catalog_item_id: input.catalog_item_id,
      status: "confirmed",
      starts_at: startsAt,
      timezone: input.timezone,
    })
    .select("id, status, starts_at, timezone, catalog_item_id")
    .single();

  if (error || !data) {
    // Unique index race: treat as slot conflict.
    if (error?.code === "23505") {
      throw new SlotConflictError();
    }
    throw new Error(`bookings insert failed: ${error?.message ?? "unknown"}`);
  }
  return data as DbBooking;
}
