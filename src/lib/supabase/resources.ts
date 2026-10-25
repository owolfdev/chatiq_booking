import { createBookingAdminClient } from "./admin";

export type ResourceKind = "person" | "room" | "other";

export type DbResource = {
  id: string;
  team_id: string;
  bot_id: string;
  slug: string;
  title: string;
  kind: ResourceKind;
  active: boolean;
  sort_order: number;
};

function slugify(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "resource";
}

function normalizeKind(value: unknown): ResourceKind {
  return value === "room" || value === "other" ? value : "person";
}

export async function listResources(input: {
  team_id: string;
  bot_id: string;
  active_only?: boolean;
}): Promise<DbResource[]> {
  const supabase = createBookingAdminClient();
  if (!supabase) return [];
  let query = supabase
    .from("resources")
    .select("id, team_id, bot_id, slug, title, kind, active, sort_order")
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id)
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (input.active_only !== false) {
    query = query.eq("active", true);
  }
  const { data, error } = await query;
  if (error) throw new Error(`resources list failed: ${error.message}`);
  return (data ?? []) as DbResource[];
}

export async function getResource(input: {
  team_id: string;
  bot_id: string;
  id_or_slug: string;
}): Promise<DbResource | null> {
  const supabase = createBookingAdminClient();
  if (!supabase) return null;
  const key = input.id_or_slug.trim();
  const byId = await supabase
    .from("resources")
    .select("id, team_id, bot_id, slug, title, kind, active, sort_order")
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id)
    .eq("id", key)
    .maybeSingle();
  if (byId.data) return byId.data as DbResource;
  const { data, error } = await supabase
    .from("resources")
    .select("id, team_id, bot_id, slug, title, kind, active, sort_order")
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id)
    .eq("slug", key.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`resources get failed: ${error.message}`);
  return (data as DbResource | null) ?? null;
}

export async function upsertResource(input: {
  team_id: string;
  bot_id: string;
  id?: string | null;
  slug?: string | null;
  title: string;
  kind?: ResourceKind | string | null;
  sort_order?: number;
  active?: boolean;
}): Promise<DbResource> {
  const supabase = createBookingAdminClient();
  if (!supabase) throw new Error("Supabase not configured");
  const title = input.title.trim();
  if (!title) throw new Error("title is required");
  const slug = (input.slug?.trim() || slugify(title)).toLowerCase();
  const row = {
    team_id: input.team_id,
    bot_id: input.bot_id,
    slug,
    title,
    kind: normalizeKind(input.kind),
    sort_order: input.sort_order ?? 0,
    active: input.active ?? true,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { data, error } = await supabase
      .from("resources")
      .update(row)
      .eq("id", input.id)
      .eq("team_id", input.team_id)
      .eq("bot_id", input.bot_id)
      .select("id, team_id, bot_id, slug, title, kind, active, sort_order")
      .single();
    if (error) throw new Error(`resources update failed: ${error.message}`);
    return data as DbResource;
  }
  const { data, error } = await supabase
    .from("resources")
    .upsert(row, { onConflict: "team_id,bot_id,slug" })
    .select("id, team_id, bot_id, slug, title, kind, active, sort_order")
    .single();
  if (error) throw new Error(`resources upsert failed: ${error.message}`);
  return data as DbResource;
}

export async function setResourceActive(input: {
  team_id: string;
  bot_id: string;
  id_or_slug: string;
  active: boolean;
}): Promise<DbResource> {
  const existing = await getResource(input);
  if (!existing) throw new Error(`Unknown resource: ${input.id_or_slug}`);
  const supabase = createBookingAdminClient();
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase
    .from("resources")
    .update({ active: input.active, updated_at: new Date().toISOString() })
    .eq("id", existing.id)
    .select("id, team_id, bot_id, slug, title, kind, active, sort_order")
    .single();
  if (error) throw new Error(`resources set_active failed: ${error.message}`);
  return data as DbResource;
}

/** Resource ids eligible for a catalog service. */
export async function listEligibleResourceIds(input: {
  catalog_item_id: string;
}): Promise<string[]> {
  const supabase = createBookingAdminClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("service_resources")
    .select("resource_id")
    .eq("catalog_item_id", input.catalog_item_id);
  if (error) {
    throw new Error(`service_resources list failed: ${error.message}`);
  }
  return (data ?? [])
    .map((r) => r.resource_id)
    .filter((id): id is string => typeof id === "string");
}

export async function listEligibleResources(input: {
  team_id: string;
  bot_id: string;
  catalog_item_id: string;
  active_only?: boolean;
}): Promise<DbResource[]> {
  const ids = await listEligibleResourceIds({
    catalog_item_id: input.catalog_item_id,
  });
  if (ids.length === 0) return [];
  const all = await listResources({
    team_id: input.team_id,
    bot_id: input.bot_id,
    active_only: input.active_only,
  });
  const set = new Set(ids);
  return all.filter((r) => set.has(r.id));
}

/** Replace eligibility matrix for one service. */
export async function setServiceResources(input: {
  team_id: string;
  bot_id: string;
  catalog_item_id: string;
  resource_ids: string[];
}): Promise<string[]> {
  const supabase = createBookingAdminClient();
  if (!supabase) throw new Error("Supabase not configured");

  // Ensure resources belong to this bot.
  if (input.resource_ids.length > 0) {
    const { data: owned, error: ownErr } = await supabase
      .from("resources")
      .select("id")
      .eq("team_id", input.team_id)
      .eq("bot_id", input.bot_id)
      .in("id", input.resource_ids);
    if (ownErr) throw new Error(`resources ownership check failed: ${ownErr.message}`);
    const ownedIds = new Set((owned ?? []).map((r) => r.id));
    const missing = input.resource_ids.filter((id) => !ownedIds.has(id));
    if (missing.length > 0) {
      throw new Error(`Unknown resource ids for this bot: ${missing.join(", ")}`);
    }
  }

  const { error: delErr } = await supabase
    .from("service_resources")
    .delete()
    .eq("catalog_item_id", input.catalog_item_id);
  if (delErr) throw new Error(`service_resources clear failed: ${delErr.message}`);

  if (input.resource_ids.length === 0) return [];

  const { error: insErr } = await supabase.from("service_resources").insert(
    input.resource_ids.map((resource_id) => ({
      catalog_item_id: input.catalog_item_id,
      resource_id,
    }))
  );
  if (insErr) throw new Error(`service_resources insert failed: ${insErr.message}`);
  return input.resource_ids;
}

/** Map catalog_item_id → eligible resource summaries (for list_services). */
export async function mapServiceResourceAnnotations(input: {
  team_id: string;
  bot_id: string;
  catalog_item_ids: string[];
}): Promise<
  Map<string, Array<{ id: string; slug: string; title: string; kind: ResourceKind }>>
> {
  const out = new Map<
    string,
    Array<{ id: string; slug: string; title: string; kind: ResourceKind }>
  >();
  if (input.catalog_item_ids.length === 0) return out;
  const supabase = createBookingAdminClient();
  if (!supabase) return out;

  const { data: links, error } = await supabase
    .from("service_resources")
    .select("catalog_item_id, resource_id")
    .in("catalog_item_id", input.catalog_item_ids);
  if (error || !links?.length) return out;

  const resourceIds = [...new Set(links.map((l) => l.resource_id))];
  const { data: resources } = await supabase
    .from("resources")
    .select("id, slug, title, kind, active")
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id)
    .in("id", resourceIds)
    .eq("active", true);
  const byId = new Map(
    (resources ?? []).map((r) => [
      r.id,
      {
        id: r.id as string,
        slug: r.slug as string,
        title: r.title as string,
        kind: normalizeKind(r.kind),
      },
    ])
  );
  for (const link of links) {
    const res = byId.get(link.resource_id);
    if (!res) continue;
    const list = out.get(link.catalog_item_id) ?? [];
    list.push(res);
    out.set(link.catalog_item_id, list);
  }
  return out;
}
