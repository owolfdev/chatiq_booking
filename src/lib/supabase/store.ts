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
