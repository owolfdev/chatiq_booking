import {
  decodeOfferedSlots,
  encodeOfferedSlots,
  formatSlotList,
  generateOfferSlots,
  matchSlotChoice,
} from "@/lib/availability";
import {
  BOOKING_API_CONTRACT_VERSION,
  type BookingTurnRequest,
  type BookingTurnResponse,
} from "@/lib/contract";
import { handleMockTurn } from "@/lib/mock/turn-handler";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  createBooking,
  ensurePilotCatalogItem,
  getLatestOpenBooking,
  getOrCreateSession,
  listTakenStarts,
  probeSupabasePersistence,
  resolveOrCreateContact,
  updateSessionStep,
} from "@/lib/supabase/store";

const DEFAULT_TZ = "Asia/Bangkok";

function okReply(params: {
  reply_text: string;
  session_id: string;
  contact_id: string;
  ui?: Record<string, unknown> | null;
}): BookingTurnResponse {
  return {
    contract_version: BOOKING_API_CONTRACT_VERSION,
    ok: true,
    reply_text: params.reply_text,
    surface_decision: "in_channel",
    session_id: params.session_id,
    contact_id: params.contact_id,
    ui: params.ui ?? null,
    mock: false,
  };
}

/**
 * Prefer Supabase when configured and schema is present; otherwise mock.
 * Pilot flow: offer slots → user picks 1/2/3 → create confirmed booking.
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
    const serviceName = catalog?.title ?? "Consultation";

    const wantsNew = /\bnew\b/i.test(text);
    const existing = await getLatestOpenBooking({
      team_id: body.team_id,
      bot_id: body.bot_id,
      contact_id: contact.id,
    });

    if ((session.step === "booked" || existing) && !wantsNew) {
      if (existing?.starts_at) {
        const when = new Intl.DateTimeFormat("en-GB", {
          timeZone: existing.timezone || timezone,
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date(existing.starts_at));
        return okReply({
          reply_text: `You already have a ${serviceName} booked for ${when}. Reply "new" if you want another appointment.`,
          session_id: session.id,
          contact_id: contact.id,
          ui: { booking_id: existing.id, status: existing.status },
        });
      }
    }

    if (wantsNew && session.step === "booked") {
      await updateSessionStep(session.id, "stub_welcome");
      session.step = "stub_welcome";
    }

    const offered = decodeOfferedSlots(session.step, timezone);
    if (offered && text) {
      const chosen = matchSlotChoice(text, offered);
      if (chosen) {
        const booking = await createBooking({
          team_id: body.team_id,
          bot_id: body.bot_id,
          contact_id: contact.id,
          session_id: session.id,
          catalog_item_id: catalog?.id ?? null,
          starts_at: chosen.starts_at,
          timezone,
        });
        await updateSessionStep(session.id, "booked");
        return okReply({
          reply_text: `Booked ${serviceName} for ${chosen.label}. Booking id ${booking.id.slice(0, 8)}.`,
          session_id: session.id,
          contact_id: contact.id,
          ui: {
            command: "booking.create",
            booking_id: booking.id,
            starts_at: booking.starts_at,
            status: booking.status,
          },
        });
      }

      return okReply({
        reply_text: `Please pick a slot by number:\n${formatSlotList(offered)}`,
        session_id: session.id,
        contact_id: contact.id,
        ui: { command: "booking.create", slots: offered },
      });
    }

    const taken = await listTakenStarts({
      team_id: body.team_id,
      bot_id: body.bot_id,
    });
    const slots = generateOfferSlots({ timeZone: timezone, takenStarts: taken });
    if (slots.length === 0) {
      return okReply({
        reply_text: `Sorry — no open ${serviceName} slots in the next few days. Try again later.`,
        session_id: session.id,
        contact_id: contact.id,
      });
    }

    await updateSessionStep(session.id, encodeOfferedSlots(slots));

    const intro = text
      ? `Great — let's book a ${serviceName}.`
      : `Ready to book a ${serviceName}.`;

    return okReply({
      reply_text: `${intro} Pick a time (reply with 1, 2, or 3):\n${formatSlotList(slots)}`,
      session_id: session.id,
      contact_id: contact.id,
      ui: { command: "booking.create", slots },
    });
  } catch (err) {
    console.error("[booking] supabase turn failed, falling back to mock", err);
    return handleMockTurn(body);
  }
}
