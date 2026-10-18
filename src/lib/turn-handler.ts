import {
  BOOKING_API_CONTRACT_VERSION,
  type BookingTurnRequest,
  type BookingTurnResponse,
} from "@/lib/contract";
import { handleMockTurn } from "@/lib/mock/turn-handler";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  ensurePilotCatalogItem,
  getOrCreateSession,
  probeSupabasePersistence,
  resolveOrCreateContact,
} from "@/lib/supabase/store";

const DEFAULT_TZ = "Asia/Bangkok";

/**
 * Prefer Supabase when configured and schema is present; otherwise mock.
 */
export async function handleTurn(
  body: BookingTurnRequest
): Promise<BookingTurnResponse> {
  if (!isSupabaseConfigured()) {
    return handleMockTurn(body);
  }

  const probe = await probeSupabasePersistence();
  if (!probe.ok) {
    console.warn(
      "[booking] supabase unavailable, falling back to mock:",
      probe.error
    );
    return handleMockTurn(body);
  }

  if (!body.team_id?.trim() || !body.bot_id?.trim()) {
    return {
      contract_version: BOOKING_API_CONTRACT_VERSION,
      ok: false,
      error: "team_id and bot_id are required",
      code: "INVALID_REQUEST",
    };
  }

  try {
    const timezone = body.timezone?.trim() || DEFAULT_TZ;
    const contact = await resolveOrCreateContact({
      team_id: body.team_id,
      claims: body.identity_claims,
    });
    const session = await getOrCreateSession({
      team_id: body.team_id,
      bot_id: body.bot_id,
      contact_id: contact.id,
      conversation_id: body.conversation_id,
      session_id: body.session_id,
      timezone,
    });

    const catalog = await ensurePilotCatalogItem({
      team_id: body.team_id,
      bot_id: body.bot_id,
    });

    const text = body.message_text?.trim() || "";
    const catalogHint = catalog
      ? ` Catalog ready: ${catalog.title} (${catalog.slug}).`
      : "";
    const reply_text = text
      ? `[booking] Got it (${timezone}). Session ${session.id} for contact ${contact.id}.${catalogHint} Next: pick a time to create a booking.`
      : `[booking] Ready (${timezone}). Session ${session.id}.${catalogHint}`;

    return {
      contract_version: BOOKING_API_CONTRACT_VERSION,
      ok: true,
      reply_text,
      surface_decision: "in_channel",
      session_id: session.id,
      contact_id: contact.id,
      ui: null,
      mock: false,
    };
  } catch (err) {
    console.error("[booking] supabase turn failed, falling back to mock", err);
    return handleMockTurn(body);
  }
}
