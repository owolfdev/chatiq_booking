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

  // Snapshot rows that will move so Phase 3b admin unmerge can reverse.
  const { data: bookingsToMove, error: bookingsListError } = await supabase
    .from("bookings")
    .select("id")
    .eq("contact_id", merged.id);
  if (bookingsListError) {
    throw new Error(`bookings list for merge failed: ${bookingsListError.message}`);
  }
  const movedBookingIds = (bookingsToMove ?? []).map((r) => r.id as string);

  const { data: sessionsToMove, error: sessionsListError } = await supabase
    .from("booking_sessions")
    .select("id")
    .eq("contact_id", merged.id);
  if (sessionsListError) {
    throw new Error(`sessions list for merge failed: ${sessionsListError.message}`);
  }
  const movedSessionIds = (sessionsToMove ?? []).map((r) => r.id as string);

  // Re-point bookings and sessions.
  if (movedBookingIds.length > 0) {
    const { error: bookingsError } = await supabase
      .from("bookings")
      .update({ contact_id: survivor.id, updated_at: new Date().toISOString() })
      .in("id", movedBookingIds);
    if (bookingsError) {
      throw new Error(`bookings re-point failed: ${bookingsError.message}`);
    }
  }
  if (movedSessionIds.length > 0) {
    const { error: sessionsError } = await supabase
      .from("booking_sessions")
      .update({ contact_id: survivor.id, updated_at: new Date().toISOString() })
      .in("id", movedSessionIds);
    if (sessionsError) {
      throw new Error(`sessions re-point failed: ${sessionsError.message}`);
    }
  }

  // Move bindings; drop duplicates the survivor already owns.
  const survivorKeys = new Set(
    survivorBindings.map((x) => `${x.provider}:${x.external_id}`)
  );
  const movedBindingIds: string[] = [];
  const deletedDuplicateBindings: Array<{
    id: string;
    provider: string;
    external_id: string;
    verified: boolean;
  }> = [];
  for (const binding of mergedBindings) {
    const key = `${binding.provider}:${binding.external_id}`;
    if (survivorKeys.has(key)) {
      deletedDuplicateBindings.push({
        id: binding.id,
        provider: binding.provider,
        external_id: binding.external_id,
        verified: binding.verified,
      });
      await supabase.from("identity_bindings").delete().eq("id", binding.id);
    } else {
      const { error } = await supabase
        .from("identity_bindings")
        .update({ contact_id: survivor.id })
        .eq("id", binding.id);
      if (error) {
        throw new Error(`identity_bindings move failed: ${error.message}`);
      }
      movedBindingIds.push(binding.id);
    }
  }

  // Keep display fields if the survivor only has placeholders.
  const survivorIsPlaceholder = !survivor.name || survivor.name === "Guest";
  const mergedHasName = Boolean(merged.name && merged.name !== "Guest");
  const survivorLacksEmail = !survivor.email?.trim();
  const mergedHasEmail = Boolean(merged.email?.trim());
  const displayCopied: { name?: string; email?: string } = {};
  if (survivorIsPlaceholder && mergedHasName && merged.name) {
    displayCopied.name = merged.name;
  }
  if (survivorLacksEmail && mergedHasEmail && merged.email) {
    displayCopied.email = merged.email;
  }
  if (Object.keys(displayCopied).length > 0) {
    await supabase
      .from("contacts")
      .update({
        ...displayCopied,
        updated_at: new Date().toISOString(),
      })
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

  const details = {
    schema: 1,
    moved_booking_ids: movedBookingIds,
    moved_session_ids: movedSessionIds,
    moved_binding_ids: movedBindingIds,
    deleted_duplicate_bindings: deletedDuplicateBindings,
    display_copied: Object.keys(displayCopied).length > 0 ? displayCopied : null,
  };

  const { error: auditError } = await supabase.from("identity_audit_log").insert({
    team_id: input.team_id,
    bot_id: input.bot_id,
    action: "merge",
    survivor_contact_id: survivor.id,
    merged_contact_id: merged.id,
    actor_type: input.actor_type,
    actor_id: input.actor_id ?? null,
    token_id: input.token_id ?? null,
    details,
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
  /** Bot that issued the token — ChatIQ uses this for channel tripwire delivery. */
  issuing_bot_id: string;
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
      issuing_bot_id: token.bot_id,
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

  return { ...result, already_linked: false, issuing_bot_id: token.bot_id };
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
  // Customer-scoped: after LINE↔web merge, bookings may live under different
  // bot_ids on the same team. Filtering by request bot_id made the consent
  // page report "0 upcoming" while the LINE booking was on the survivor.
  void input.bot_id;
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("id, status, starts_at, timezone, catalog_item_id")
    .eq("team_id", input.team_id)
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

export type IdentityAuditRow = {
  id: string;
  team_id: string;
  bot_id: string;
  action: "merge" | "unmerge";
  survivor_contact_id: string;
  merged_contact_id: string;
  actor_type: string;
  actor_id: string | null;
  token_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  can_unmerge: boolean;
};

type MergeDetailsV1 = {
  schema?: number;
  moved_booking_ids?: string[];
  moved_session_ids?: string[];
  moved_binding_ids?: string[];
  deleted_duplicate_bindings?: Array<{
    id: string;
    provider: string;
    external_id: string;
    verified: boolean;
  }>;
  display_copied?: { name?: string; email?: string } | null;
};

function hasUnmergeSnapshot(details: Record<string, unknown> | null | undefined): boolean {
  if (!details || typeof details !== "object") return false;
  const d = details as MergeDetailsV1;
  return (
    Array.isArray(d.moved_booking_ids) ||
    Array.isArray(d.moved_session_ids) ||
    Array.isArray(d.moved_binding_ids) ||
    Array.isArray(d.deleted_duplicate_bindings)
  );
}

/** Staff: identity audit for a contact (survivor or tombstone side). */
export async function listIdentityAudit(input: {
  team_id: string;
  contact_id?: string | null;
  limit?: number;
}): Promise<IdentityAuditRow[]> {
  const supabase = createBookingAdminClient();
  if (!supabase) return [];

  const limit =
    typeof input.limit === "number" && Number.isFinite(input.limit)
      ? Math.min(Math.max(Math.floor(input.limit), 1), 100)
      : 40;

  let query = supabase
    .from("identity_audit_log")
    .select(
      "id, team_id, bot_id, action, survivor_contact_id, merged_contact_id, actor_type, actor_id, token_id, details, created_at"
    )
    .eq("team_id", input.team_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (input.contact_id?.trim()) {
    const contactId = input.contact_id.trim();
    // PostgREST: or filter on either side of the merge.
    query = query.or(
      `survivor_contact_id.eq.${contactId},merged_contact_id.eq.${contactId}`
    );
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`identity_audit_log list failed: ${error.message}`);
  }

  const rows = (data ?? []) as Array<Omit<IdentityAuditRow, "can_unmerge"> & {
    details: Record<string, unknown> | null;
  }>;

  // A merge can be unmerged only if the tombstone is still pointing at the
  // survivor and we have a reversible snapshot (schema ≥1 merges).
  const mergedIds = [
    ...new Set(rows.filter((r) => r.action === "merge").map((r) => r.merged_contact_id)),
  ];
  const tombstones = new Map<string, string | null>();
  if (mergedIds.length > 0) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, merged_into")
      .in("id", mergedIds);
    for (const c of contacts ?? []) {
      tombstones.set(c.id as string, (c.merged_into as string | null) ?? null);
    }
  }

  const unmergeRows = rows.filter((r) => r.action === "unmerge");

  return rows.map((r) => {
    const laterUnmerge = unmergeRows.some(
      (u) =>
        u.survivor_contact_id === r.survivor_contact_id &&
        u.merged_contact_id === r.merged_contact_id &&
        u.created_at > r.created_at
    );
    const stillMerged =
      r.action === "merge" &&
      tombstones.get(r.merged_contact_id) === r.survivor_contact_id &&
      !laterUnmerge;
    return {
      ...r,
      details: (r.details ?? {}) as Record<string, unknown>,
      can_unmerge: Boolean(stillMerged && hasUnmergeSnapshot(r.details ?? {})),
    };
  });
}

/**
 * Admin-only reverse of a merge, from the audit record.
 * Requires merge.details snapshot written at merge time (schema 1+).
 */
export async function unmergeFromAudit(input: {
  team_id: string;
  bot_id: string;
  audit_id: string;
  actor_type: string;
  actor_id?: string | null;
}): Promise<{
  survivor_contact_id: string;
  restored_contact_id: string;
  restored_bookings: number;
  restored_bindings: number;
}> {
  const supabase = createBookingAdminClient();
  if (!supabase) throw new Error("Supabase not configured");

  const { data: audit, error: auditLoadError } = await supabase
    .from("identity_audit_log")
    .select(
      "id, team_id, bot_id, action, survivor_contact_id, merged_contact_id, details, created_at"
    )
    .eq("id", input.audit_id)
    .eq("team_id", input.team_id)
    .maybeSingle();
  if (auditLoadError) {
    throw new Error(`identity_audit_log load failed: ${auditLoadError.message}`);
  }
  if (!audit) {
    throw new IdentityError("AUDIT_NOT_FOUND", "No matching identity audit record");
  }
  if (audit.action !== "merge") {
    throw new IdentityError("NOT_A_MERGE", "Only merge audit rows can be unmerged");
  }

  const survivorId = audit.survivor_contact_id as string;
  const restoredId = audit.merged_contact_id as string;
  const details = (audit.details ?? {}) as MergeDetailsV1;

  if (!hasUnmergeSnapshot(details as Record<string, unknown>)) {
    throw new IdentityError(
      "UNMERGE_UNSUPPORTED",
      "This merge has no reversible snapshot (pre-schema merges cannot be auto-unmerged)"
    );
  }

  const restored = await getContactById({
    team_id: input.team_id,
    contact_id: restoredId,
  });
  if (!restored) {
    throw new IdentityError("CONTACT_NOT_FOUND", "Merged contact no longer exists");
  }
  if (restored.merged_into !== survivorId) {
    throw new IdentityError(
      "ALREADY_UNMERGED",
      "Merged contact is no longer tombstoned under this survivor"
    );
  }

  // Refuse if a later unmerge audit already exists for this pair.
  const { data: laterUnmerge } = await supabase
    .from("identity_audit_log")
    .select("id")
    .eq("team_id", input.team_id)
    .eq("action", "unmerge")
    .eq("survivor_contact_id", survivorId)
    .eq("merged_contact_id", restoredId)
    .gt("created_at", audit.created_at)
    .limit(1);
  if ((laterUnmerge ?? []).length > 0) {
    throw new IdentityError("ALREADY_UNMERGED", "This merge was already unmerged");
  }

  const movedBookingIds = details.moved_booking_ids ?? [];
  const movedSessionIds = details.moved_session_ids ?? [];
  const movedBindingIds = details.moved_binding_ids ?? [];
  const deletedDupes = details.deleted_duplicate_bindings ?? [];

  if (movedBookingIds.length > 0) {
    const { error } = await supabase
      .from("bookings")
      .update({ contact_id: restoredId, updated_at: new Date().toISOString() })
      .in("id", movedBookingIds)
      .eq("contact_id", survivorId);
    if (error) throw new Error(`bookings restore failed: ${error.message}`);
  }
  if (movedSessionIds.length > 0) {
    const { error } = await supabase
      .from("booking_sessions")
      .update({ contact_id: restoredId, updated_at: new Date().toISOString() })
      .in("id", movedSessionIds)
      .eq("contact_id", survivorId);
    if (error) throw new Error(`sessions restore failed: ${error.message}`);
  }
  if (movedBindingIds.length > 0) {
    const { error } = await supabase
      .from("identity_bindings")
      .update({ contact_id: restoredId })
      .in("id", movedBindingIds)
      .eq("contact_id", survivorId);
    if (error) throw new Error(`bindings restore failed: ${error.message}`);
  }

  // Recreate bindings that were deleted as duplicates of the survivor.
  for (const dup of deletedDupes) {
    const { error } = await supabase.from("identity_bindings").insert({
      team_id: input.team_id,
      contact_id: restoredId,
      provider: dup.provider,
      external_id: dup.external_id,
      verified: dup.verified,
    });
    // Unique conflict = already exists; treat as ok for idempotent retry.
    if (error && !/duplicate|unique/i.test(error.message)) {
      throw new Error(`binding recreate failed: ${error.message}`);
    }
  }

  const { error: clearError } = await supabase
    .from("contacts")
    .update({
      merged_into: null,
      merged_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", restoredId);
  if (clearError) {
    throw new Error(`contacts untombstone failed: ${clearError.message}`);
  }

  const { error: auditInsertError } = await supabase.from("identity_audit_log").insert({
    team_id: input.team_id,
    bot_id: input.bot_id,
    action: "unmerge",
    survivor_contact_id: survivorId,
    merged_contact_id: restoredId,
    actor_type: input.actor_type,
    actor_id: input.actor_id ?? null,
    token_id: null,
    details: {
      schema: 1,
      source_audit_id: input.audit_id,
      restored_booking_ids: movedBookingIds,
      restored_session_ids: movedSessionIds,
      restored_binding_ids: movedBindingIds,
      recreated_bindings: deletedDupes.length,
    },
  });
  if (auditInsertError) {
    throw new Error(`identity_audit_log unmerge insert failed: ${auditInsertError.message}`);
  }

  return {
    survivor_contact_id: survivorId,
    restored_contact_id: restoredId,
    restored_bookings: movedBookingIds.length,
    restored_bindings: movedBindingIds.length + deletedDupes.length,
  };
}
