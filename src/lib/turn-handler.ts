import {
  decodeOfferedSlots,
  encodeOfferedSlots,
  formatSlotList,
  generateOfferSlots,
  matchSlotChoice,
} from "@/lib/availability";
import { resolveBookingCommand } from "@/lib/commands";
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
  SlotConflictError,
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

function formatWhen(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/**
 * Prefer Supabase when configured; route by booking command catalog.
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
    const selection = resolveBookingCommand({
      messageText: text,
      clientCommand: body.command,
      clientConfidence: body.confidence,
      sessionStep: session.step,
    });

    const existing = await getLatestOpenBooking({
      team_id: body.team_id,
      bot_id: body.bot_id,
      contact_id: contact.id,
    });

    if (selection.command === "booking.lookup") {
      if (existing?.starts_at) {
        return okReply({
          reply_text: `You have a ${serviceName} on ${formatWhen(existing.starts_at, existing.timezone || timezone)} (status: ${existing.status}).`,
          session_id: session.id,
          contact_id: contact.id,
          ui: {
            command: "booking.lookup",
            booking_id: existing.id,
            status: existing.status,
            starts_at: existing.starts_at,
            selection,
          },
        });
      }
      return okReply({
        reply_text: `I don’t see an upcoming ${serviceName} for you. Say “book” if you’d like to schedule one.`,
        session_id: session.id,
        contact_id: contact.id,
        ui: { command: "booking.lookup", selection },
      });
    }

    if (selection.command === "booking.clarify") {
      return okReply({
        reply_text:
          "Did you want to book a new appointment, or check an existing one?",
        session_id: session.id,
        contact_id: contact.id,
        ui: { command: "booking.clarify", selection },
      });
    }

    if (
      selection.command === "booking.cancel" ||
      selection.command === "booking.reschedule" ||
      selection.command === "booking.faq"
    ) {
      return okReply({
        reply_text: `That action (${selection.command}) isn’t available in the pilot yet. You can book a new ${serviceName}, or ask to check an existing booking.`,
        session_id: session.id,
        contact_id: contact.id,
        ui: { command: selection.command, selection },
      });
    }

    // booking.create
    const wantsNew = /\bnew\b/i.test(text);
    if ((session.step === "booked" || existing) && !wantsNew) {
      if (existing?.starts_at) {
        return okReply({
          reply_text: `You already have a ${serviceName} booked for ${formatWhen(existing.starts_at, existing.timezone || timezone)}. Reply "new" if you want another appointment, or ask to check your booking.`,
          session_id: session.id,
          contact_id: contact.id,
          ui: {
            command: "booking.create",
            booking_id: existing.id,
            status: existing.status,
            selection,
          },
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
        try {
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
              selection,
            },
          });
        } catch (err) {
          if (!(err instanceof SlotConflictError)) throw err;
          const taken = await listTakenStarts({
            team_id: body.team_id,
            bot_id: body.bot_id,
          });
          const slots = generateOfferSlots({
            timeZone: timezone,
            takenStarts: taken,
          });
          await updateSessionStep(session.id, encodeOfferedSlots(slots));
          return okReply({
            reply_text: `Sorry — that time was just taken. Pick another:\n${formatSlotList(slots)}`,
            session_id: session.id,
            contact_id: contact.id,
            ui: { command: "booking.create", slots, selection },
          });
        }
      }

      return okReply({
        reply_text: `Please pick a slot by number:\n${formatSlotList(offered)}`,
        session_id: session.id,
        contact_id: contact.id,
        ui: { command: "booking.create", slots: offered, selection },
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
        ui: { command: "booking.create", selection },
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
      ui: { command: "booking.create", slots, selection },
    });
  } catch (err) {
    console.error("[booking] supabase turn failed, falling back to mock", err);
    return handleMockTurn(body);
  }
}
