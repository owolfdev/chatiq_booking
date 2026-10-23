import { createHash, randomBytes, randomInt } from "node:crypto";

import { createBookingAdminClient } from "./admin";
import { getContactById, type DbContact } from "./store";

/**
 * Phase 3a — identity & account linking.
 * Spec: dev_docs/identity-and-account-linking.md
 *
 * A merge proves control of BOTH channel accounts: a one-time connect token
 * issued at one door is redeemed at the other. Merging is deterministic and
 * sibling-side; never merge on claimed name/phone/email.
 */

export class IdentityError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "IdentityError";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const TOKEN_TTL_MS = 10 * 60 * 1000;

export async function createConnectToken(input: {
  team_id: string;
  bot_id: string;
  contact_id: string;
}): Promise<{ token: string; short_code: string; expires_at: string }> {
  const supabase = createBookingAdminClient();
  if (!supabase) throw new Error("Supabase not configured");

  // Supersede any outstanding tokens for this contact.
  await supabase
    .from("connect_tokens")
    .update({ consumed_at: new Date().toISOString() })
    .eq("issuing_contact_id", input.contact_id)
    .is("consumed_at", null);

  const token = randomBytes(32).toString("hex");
  const short_code = String(randomInt(100_000, 1_000_000));
  const expires_at = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const { error } = await supabase.from("connect_tokens").insert({
    team_id: input.team_id,
    bot_id: input.bot_id,
    issuing_contact_id: input.contact_id,
    token_hash: sha256(token),
    short_code_hash: sha256(short_code),
    expires_at,
  });
  if (error) {
    throw new Error(`connect_tokens insert failed: ${error.message}`);
  }
  return { token, short_code, expires_at };
}

/** Follow merged_into chain to the surviving contact id. */
export async function resolveSurvivorContactId(input: {
  team_id: string;
  contact_id: string;
}): Promise<string> {
  let current = input.contact_id;
  for (let i = 0; i < 5; i++) {
    const contact = await getContactById({
      team_id: input.team_id,
      contact_id: current,
    });
    if (!contact?.merged_into) return current;
    current = contact.merged_into;
  }
  return current;
}

type DbBinding = {
  id: string;
  contact_id: string;
  provider: string;
  external_id: string;
  verified: boolean;
  created_at?: string;
};

async function listBindings(contactId: string): Promise<DbBinding[]> {
  const supabase = createBookingAdminClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("identity_bindings")
    .select("id, contact_id, provider, external_id, verified, created_at")
    .eq("contact_id", contactId);
  if (error) throw new Error(`identity_bindings list failed: ${error.message}`);
  return (data ?? []) as DbBinding[];
}

/**
 * Deterministic merge of two contacts (internal — called by token
 * redemption and, later, admin tooling; never directly by the LLM).
 */
export async function mergeContacts(input: {
  team_id: string;
  bot_id: string;
  contact_a: string;
  contact_b: string;
  actor_type: string;
  actor_id?: string | null;
  token_id?: string | null;
}): Promise<{ survivor_contact_id: string; merged_contact_id: string }> {
  const supabase = createBookingAdminClient();
  if (!supabase) throw new Error("Supabase not configured");

  const aId = await resolveSurvivorContactId({
    team_id: input.team_id,
    contact_id: input.contact_a,
  });
  const bId = await resolveSurvivorContactId({
    team_id: input.team_id,
    contact_id: input.contact_b,
  });
  if (aId === bId) {
    return { survivor_contact_id: aId, merged_contact_id: aId };
  }

  const [a, b] = await Promise.all([
    getContactById({ team_id: input.team_id, contact_id: aId }),
    getContactById({ team_id: input.team_id, contact_id: bId }),
  ]);
  if (!a || !b) {
    throw new IdentityError("CONTACT_NOT_FOUND", "One of the contacts no longer exists");
  }

  const [aBindings, bBindings] = await Promise.all([
    listBindings(aId),
    listBindings(bId),
  ]);

  // Conflict: any of these bindings already owned by a third customer.
  const allBindings = [...aBindings, ...bBindings];
  const externalIds = [...new Set(allBindings.map((x) => x.external_id))];
  if (externalIds.length > 0) {
    const { data: thirdParty, error } = await supabase
      .from("identity_bindings")
      .select("id, contact_id, provider, external_id")
      .eq("team_id", input.team_id)
      .in("external_id", externalIds)
      .not("contact_id", "in", `(${aId},${bId})`);
    if (error) {
      throw new Error(`identity_bindings conflict check failed: ${error.message}`);
    }
    const clash = (thirdParty ?? []).some((row) =>
      allBindings.some(
        (x) => x.provider === row.provider && x.external_id === row.external_id
      )
    );
    if (clash) {
      throw new IdentityError(
        "MERGE_CONFLICT",
        "A channel account is already linked to another customer; admin review required"
      );
    }
  }

  // Survivor rule: verified web profile wins; else the older contact.
  const aHasWeb = aBindings.some((x) => x.provider === "web_user");
  const bHasWeb = bBindings.some((x) => x.provider === "web_user");
  let survivor: DbContact;
  let merged: DbContact;
  let survivorBindings: DbBinding[];
  let mergedBindings: DbBinding[];
  if (aHasWeb !== bHasWeb) {
    survivor = aHasWeb ? a : b;
    merged = aHasWeb ? b : a;
    survivorBindings = aHasWeb ? aBindings : bBindings;
    mergedBindings = aHasWeb ? bBindings : aBindings;
  } else {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    const aOlder = aTime <= bTime;
    survivor = aOlder ? a : b;
    merged = aOlder ? b : a;
    survivorBindings = aOlder ? aBindings : bBindings;
    mergedBindings = aOlder ? bBindings : aBindings;
  }

  // Re-point bookings and sessions.
  const { error: bookingsError } = await supabase
    .from("bookings")
    .update({ contact_id: survivor.id, updated_at: new Date().toISOString() })
    .eq("contact_id", merged.id);
  if (bookingsError) {
    throw new Error(`bookings re-point failed: ${bookingsError.message}`);
  }
  const { error: sessionsError } = await supabase
    .from("booking_sessions")
    .update({ contact_id: survivor.id, updated_at: new Date().toISOString() })
    .eq("contact_id", merged.id);
  if (sessionsError) {
    throw new Error(`sessions re-point failed: ${sessionsError.message}`);
  }

  // Move bindings; drop duplicates the survivor already owns.
  const survivorKeys = new Set(
    survivorBindings.map((x) => `${x.provider}:${x.external_id}`)
  );
  for (const binding of mergedBindings) {
    const key = `${binding.provider}:${binding.external_id}`;
    if (survivorKeys.has(key)) {
      await supabase.from("identity_bindings").delete().eq("id", binding.id);
    } else {
      const { error } = await supabase
        .from("identity_bindings")
        .update({ contact_id: survivor.id })
        .eq("id", binding.id);
      if (error) {
        throw new Error(`identity_bindings move failed: ${error.message}`);
      }
    }
  }

  // Keep a real display name if the survivor only has the placeholder.
  const survivorIsPlaceholder = !survivor.name || survivor.name === "Guest";
  const mergedHasName = merged.name && merged.name !== "Guest";
  if (survivorIsPlaceholder && mergedHasName) {
    await supabase
      .from("contacts")
      .update({ name: merged.name, updated_at: new Date().toISOString() })
      .eq("id", survivor.id);
  }

  // Tombstone the merged contact.
  const { error: tombstoneError } = await supabase
    .from("contacts")
    .update({
      merged_into: survivor.id,
      merged_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", merged.id);
  if (tombstoneError) {
    throw new Error(`contacts tombstone failed: ${tombstoneError.message}`);
  }

  const { error: auditError } = await supabase.from("identity_audit_log").insert({
    team_id: input.team_id,
    bot_id: input.bot_id,
    action: "merge",
    survivor_contact_id: survivor.id,
    merged_contact_id: merged.id,
    actor_type: input.actor_type,
    actor_id: input.actor_id ?? null,
    token_id: input.token_id ?? null,
    details: {},
  });
  if (auditError) {
    throw new Error(`identity_audit_log insert failed: ${auditError.message}`);
  }

  return { survivor_contact_id: survivor.id, merged_contact_id: merged.id };
}

export async function redeemConnectToken(input: {
  team_id: string;
  bot_id: string;
  code: string;
  redeeming_contact_id: string;
  actor_type?: string;
  actor_id?: string | null;
}): Promise<{
  survivor_contact_id: string;
  merged_contact_id: string;
  already_linked: boolean;
}> {
  const supabase = createBookingAdminClient();
  if (!supabase) throw new Error("Supabase not configured");

  const raw = input.code.trim();
  const digits = raw.replace(/\D/g, "");

  let token: {
    id: string;
    team_id: string;
    bot_id: string;
    issuing_contact_id: string;
    expires_at: string;
    consumed_at: string | null;
  } | null = null;
  /** Full URL tokens are globally unique by hash; short codes are bot-scoped. */
  let matchedBy: "token" | "short_code" | null = null;

  const { data: byToken } = await supabase
    .from("connect_tokens")
    .select("id, team_id, bot_id, issuing_contact_id, expires_at, consumed_at")
    .eq("token_hash", sha256(raw))
    .maybeSingle();
  if (byToken) {
    token = byToken;
    matchedBy = "token";
  }

  if (!token && digits.length >= 6) {
    // Short codes can collide across customers; prefer a live token, but
    // keep a consumed one visible so reuse reports TOKEN_USED, not INVALID.
    const { data: byCode } = await supabase
      .from("connect_tokens")
      .select("id, team_id, bot_id, issuing_contact_id, expires_at, consumed_at")
      .eq("team_id", input.team_id)
      .eq("bot_id", input.bot_id)
      .eq("short_code_hash", sha256(digits.slice(-6)))
      .order("created_at", { ascending: false })
      .limit(5);
    const candidates = byCode ?? [];
    token =
      candidates.find((t) => !t.consumed_at) ?? candidates[0] ?? null;
    if (token) matchedBy = "short_code";
  }

  // Team must always match. Full-token (URL) redeem may be called from the
  // ChatIQ consent page with a different allowlisted bot_id on the same
  // team — the hash is unique, so bot_id on the request is not required.
  // Short codes stay scoped to the requesting bot.
  if (
    !token ||
    token.team_id !== input.team_id ||
    (matchedBy === "short_code" && token.bot_id !== input.bot_id)
  ) {
    throw new IdentityError("TOKEN_INVALID", "Connect code is invalid");
  }
  if (token.consumed_at) {
    throw new IdentityError("TOKEN_USED", "Connect code was already used");
  }
  if (new Date(token.expires_at).getTime() <= Date.now()) {
    throw new IdentityError("TOKEN_EXPIRED", "Connect code has expired");
  }

  const issuingId = await resolveSurvivorContactId({
    team_id: input.team_id,
    contact_id: token.issuing_contact_id,
  });
  const redeemingId = await resolveSurvivorContactId({
    team_id: input.team_id,
    contact_id: input.redeeming_contact_id,
  });

  if (issuingId === redeemingId) {
    await supabase
      .from("connect_tokens")
      .update({
        consumed_at: new Date().toISOString(),
        redeemed_contact_id: input.redeeming_contact_id,
      })
      .eq("id", token.id);
    return {
      survivor_contact_id: issuingId,
      merged_contact_id: issuingId,
      already_linked: true,
    };
  }

  const result = await mergeContacts({
    team_id: input.team_id,
    // Prefer the issuing bot from the token (consent page may pass another
    // allowlisted bot on the same team as request scope).
    bot_id: token.bot_id,
    contact_a: issuingId,
    contact_b: redeemingId,
    actor_type: input.actor_type ?? "customer",
    actor_id: input.actor_id ?? null,
    token_id: token.id,
  });

  await supabase
    .from("connect_tokens")
    .update({
      consumed_at: new Date().toISOString(),
      redeemed_contact_id: input.redeeming_contact_id,
    })
    .eq("id", token.id);

  return { ...result, already_linked: false };
}

export async function getCustomerProfile(input: {
  team_id: string;
  bot_id: string;
  contact_id: string;
}): Promise<{
  contact: DbContact;
  bindings: Array<{
    provider: string;
    external_id: string;
    verified: boolean;
    created_at?: string;
  }>;
  upcoming_bookings: Array<{
    id: string;
    status: string;
    starts_at: string | null;
    timezone: string;
    catalog_item_id: string | null;
  }>;
} | null> {
  const supabase = createBookingAdminClient();
  if (!supabase) return null;

  const survivorId = await resolveSurvivorContactId(input);
  const contact = await getContactById({
    team_id: input.team_id,
    contact_id: survivorId,
  });
  if (!contact) return null;

  const bindings = await listBindings(survivorId);
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("id, status, starts_at, timezone, catalog_item_id")
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id)
    .eq("contact_id", survivorId)
    .in("status", ["pending", "confirmed"])
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true });
  if (error) {
    throw new Error(`bookings for customer failed: ${error.message}`);
  }

  return {
    contact,
    bindings: bindings.map((b) => ({
      provider: b.provider,
      external_id: b.external_id,
      verified: b.verified,
      created_at: b.created_at,
    })),
    upcoming_bookings: bookings ?? [],
  };
}
