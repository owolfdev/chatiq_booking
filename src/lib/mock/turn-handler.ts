import {
  BOOKING_API_CONTRACT_VERSION,
  type BookingTurnRequest,
  type BookingTurnResponse,
} from "@/lib/contract";
import {
  getOrCreateMockSession,
  resolveOrCreateMockContact,
} from "@/lib/mock/store";

const DEFAULT_TZ = "Asia/Bangkok";

export function handleMockTurn(body: BookingTurnRequest): BookingTurnResponse {
  if (!body.team_id?.trim() || !body.bot_id?.trim()) {
    return {
      contract_version: BOOKING_API_CONTRACT_VERSION,
      ok: false,
      error: "team_id and bot_id are required",
      code: "INVALID_REQUEST",
    };
  }

  const timezone = body.timezone?.trim() || DEFAULT_TZ;
  const contact = resolveOrCreateMockContact({
    team_id: body.team_id,
    claims: body.identity_claims,
  });
  const session = getOrCreateMockSession({
    team_id: body.team_id,
    bot_id: body.bot_id,
    contact_id: contact.id,
    conversation_id: body.conversation_id,
    session_id: body.session_id,
    timezone,
  });

  const text = body.message_text?.trim() || "";
  const reply_text = text
    ? `[booking stub] Got it (${timezone}). Session ${session.id} for contact ${contact.id}. Real flow comes next.`
    : `[booking stub] Ready to book (${timezone}). Send a message to continue. Session ${session.id}.`;

  return {
    contract_version: BOOKING_API_CONTRACT_VERSION,
    ok: true,
    reply_text,
    surface_decision: "in_channel",
    session_id: session.id,
    contact_id: contact.id,
    ui: null,
    mock: true,
  };
}
