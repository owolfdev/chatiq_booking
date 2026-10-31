import { createBookingAdminClient } from "./admin";

export type CatalogService = {
  id: string;
  team_id: string;
  bot_id: string;
  slug: string;
  title: string;
  duration_minutes: number;
  active: boolean;
  description: string | null;
  category: string | null;
  sort_order: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  capacity: number;
  /** Max people per booking of this service/room (stays occupancy policy). */
  max_guests: number;
  price_cents: number | null;
  currency: string | null;
  booking_horizon_days: number | null;
  min_notice_minutes: number | null;
  /** When non-empty (e.g. ["person","room"]), booking must assign one eligible resource per kind. */
  require_resource_kinds: string[];
};

const CATALOG_SELECT =
  "id, team_id, bot_id, slug, title, duration_minutes, active, description, category, sort_order, buffer_before_minutes, buffer_after_minutes, capacity, max_guests, price_cents, currency, booking_horizon_days, min_notice_minutes, require_resource_kinds";

export function normalizeRequireResourceKinds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(["person", "room", "other"]);
  const out: string[] = [];
  for (const v of raw) {
    const k = String(v);
    if (allowed.has(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

function mapCatalogRow(row: Record<string, unknown>): CatalogService {
  const maxGuestsRaw = row.max_guests;
  const maxGuests =
    typeof maxGuestsRaw === "number" && Number.isFinite(maxGuestsRaw)
      ? Math.max(1, Math.floor(maxGuestsRaw))
      : 2;
  return {
    ...(row as unknown as CatalogService),
    max_guests: maxGuests,
    require_resource_kinds: normalizeRequireResourceKinds(
      row.require_resource_kinds
    ),
  };
}

function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function listCatalogServices(input: {
  team_id: string;
  bot_id: string;
  active_only?: boolean;
}): Promise<CatalogService[]> {
  const supabase = createBookingAdminClient();
  if (!supabase) return [];
  let query = supabase
    .from("catalog_items")
    .select(CATALOG_SELECT)
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id)
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (input.active_only !== false) {
    query = query.eq("active", true);
  }
  const { data, error } = await query;
  if (error) throw new Error(`catalog list failed: ${error.message}`);
  return (data ?? []).map((r) => mapCatalogRow(r as Record<string, unknown>));
}

export async function searchCatalogServices(input: {
  team_id: string;
  bot_id: string;
  query?: string | null;
  category?: string | null;
  limit?: number;
}): Promise<CatalogService[]> {
  const all = await listCatalogServices({
    team_id: input.team_id,
    bot_id: input.bot_id,
    active_only: true,
  });
  const q = input.query?.trim().toLowerCase() ?? "";
  const category = input.category?.trim().toLowerCase() ?? "";
  const limit = Math.min(20, Math.max(1, input.limit ?? 8));
  const filtered = all.filter((s) => {
    if (category && (s.category ?? "").toLowerCase() !== category) return false;
    if (!q) return true;
    const hay = `${s.title} ${s.slug} ${s.description ?? ""} ${s.category ?? ""}`.toLowerCase();
    return hay.includes(q);
  });
  return filtered.slice(0, limit);
}

export async function getCatalogService(input: {
  team_id: string;
  bot_id: string;
  id_or_slug: string;
}): Promise<CatalogService | null> {
  const supabase = createBookingAdminClient();
  if (!supabase) return null;
  const key = input.id_or_slug.trim();
  const { data: byId } = await supabase
    .from("catalog_items")
    .select(CATALOG_SELECT)
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id)
    .eq("id", key)
    .maybeSingle();
  if (byId) return mapCatalogRow(byId as Record<string, unknown>);
  const { data: bySlug, error } = await supabase
    .from("catalog_items")
    .select(CATALOG_SELECT)
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id)
    .eq("slug", key.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`catalog get failed: ${error.message}`);
  return bySlug
    ? mapCatalogRow(bySlug as Record<string, unknown>)
    : null;
}

export type UpsertServiceInput = {
  team_id: string;
  bot_id: string;
  id?: string | null;
  slug?: string | null;
  title: string;
  duration_minutes: number;
  description?: string | null;
  category?: string | null;
  sort_order?: number;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  capacity?: number;
  /** Max people per booking of this room/service (default 2). */
  max_guests?: number;
  price_cents?: number | null;
  currency?: string | null;
  booking_horizon_days?: number | null;
  min_notice_minutes?: number | null;
  active?: boolean;
  require_resource_kinds?: string[] | null;
};

export async function upsertCatalogService(
  input: UpsertServiceInput
): Promise<CatalogService> {
  const supabase = createBookingAdminClient();
  if (!supabase) throw new Error("Supabase not configured");

  const title = input.title.trim();
  if (!title) throw new Error("title is required");
  if (!Number.isFinite(input.duration_minutes) || input.duration_minutes <= 0) {
    throw new Error("duration_minutes must be > 0");
  }
  const capacity = input.capacity ?? 1;
  if (!Number.isFinite(capacity) || capacity < 1) {
    throw new Error("capacity must be >= 1");
  }
  const maxGuests = input.max_guests ?? 2;
  if (!Number.isFinite(maxGuests) || maxGuests < 1) {
    throw new Error("max_guests must be >= 1");
  }

  const slug =
    (input.slug?.trim() ? slugify(input.slug) : null) ||
    slugify(title) ||
    "service";

  const row = {
    team_id: input.team_id,
    bot_id: input.bot_id,
    slug,
    title,
    duration_minutes: Math.floor(input.duration_minutes),
    description: input.description?.trim() || null,
    category: input.category?.trim() || null,
    sort_order: input.sort_order ?? 0,
    buffer_before_minutes: Math.max(0, Math.floor(input.buffer_before_minutes ?? 0)),
    buffer_after_minutes: Math.max(0, Math.floor(input.buffer_after_minutes ?? 0)),
    capacity: Math.floor(capacity),
    max_guests: Math.floor(maxGuests),
    price_cents:
      typeof input.price_cents === "number" ? Math.floor(input.price_cents) : null,
    currency: input.currency?.trim().toUpperCase() || null,
    booking_horizon_days:
      typeof input.booking_horizon_days === "number"
        ? Math.floor(input.booking_horizon_days)
        : null,
    min_notice_minutes:
      typeof input.min_notice_minutes === "number"
        ? Math.floor(input.min_notice_minutes)
        : null,
    active: input.active !== false,
    updated_at: new Date().toISOString(),
    ...(input.require_resource_kinds !== undefined
      ? {
          require_resource_kinds: normalizeRequireResourceKinds(
            input.require_resource_kinds
          ),
        }
      : {}),
  };

  if (input.id?.trim()) {
    const { data, error } = await supabase
      .from("catalog_items")
      .update(row)
      .eq("id", input.id.trim())
      .eq("team_id", input.team_id)
      .eq("bot_id", input.bot_id)
      .select(CATALOG_SELECT)
      .single();
    if (error) throw new Error(`catalog update failed: ${error.message}`);
    return mapCatalogRow(data as Record<string, unknown>);
  }

  const { data, error } = await supabase
    .from("catalog_items")
    .upsert(row, { onConflict: "team_id,bot_id,slug" })
    .select(CATALOG_SELECT)
    .single();
  if (error) throw new Error(`catalog upsert failed: ${error.message}`);
  return mapCatalogRow(data as Record<string, unknown>);
}

export async function setCatalogServiceActive(input: {
  team_id: string;
  bot_id: string;
  id_or_slug: string;
  active: boolean;
}): Promise<CatalogService> {
  const existing = await getCatalogService(input);
  if (!existing) throw new Error("SERVICE_NOT_FOUND");
  const supabase = createBookingAdminClient();
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase
    .from("catalog_items")
    .update({ active: input.active, updated_at: new Date().toISOString() })
    .eq("id", existing.id)
    .select(CATALOG_SELECT)
    .single();
  if (error) throw new Error(`catalog set_active failed: ${error.message}`);
  return mapCatalogRow(data as Record<string, unknown>);
}

export async function setServiceRequireResourceKinds(input: {
  team_id: string;
  bot_id: string;
  catalog_item_id: string;
  require_resource_kinds: string[];
}): Promise<CatalogService> {
  const supabase = createBookingAdminClient();
  if (!supabase) throw new Error("Supabase not configured");
  const kinds = normalizeRequireResourceKinds(input.require_resource_kinds);
  const { data, error } = await supabase
    .from("catalog_items")
    .update({
      require_resource_kinds: kinds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.catalog_item_id)
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id)
    .select(CATALOG_SELECT)
    .single();
  if (error) {
    throw new Error(`catalog require_resource_kinds failed: ${error.message}`);
  }
  return mapCatalogRow(data as Record<string, unknown>);
}

export async function reorderCatalogServices(input: {
  team_id: string;
  bot_id: string;
  ordered_ids: string[];
}): Promise<CatalogService[]> {
  const supabase = createBookingAdminClient();
  if (!supabase) throw new Error("Supabase not configured");
  const now = new Date().toISOString();
  for (let i = 0; i < input.ordered_ids.length; i++) {
    const id = input.ordered_ids[i]?.trim();
    if (!id) continue;
    const { error } = await supabase
      .from("catalog_items")
      .update({ sort_order: i, updated_at: now })
      .eq("id", id)
      .eq("team_id", input.team_id)
      .eq("bot_id", input.bot_id);
    if (error) throw new Error(`catalog reorder failed: ${error.message}`);
  }
  return listCatalogServices({
    team_id: input.team_id,
    bot_id: input.bot_id,
    active_only: false,
  });
}

/** Seed Consultation only when the bot has zero catalog rows. */
export async function ensurePilotCatalogIfEmpty(input: {
  team_id: string;
  bot_id: string;
}): Promise<CatalogService | null> {
  const existing = await listCatalogServices({
    ...input,
    active_only: false,
  });
  if (existing.length > 0) return existing[0] ?? null;
  return upsertCatalogService({
    team_id: input.team_id,
    bot_id: input.bot_id,
    slug: "consultation",
    title: "Consultation",
    duration_minutes: 30,
    sort_order: 0,
    active: true,
  });
}
