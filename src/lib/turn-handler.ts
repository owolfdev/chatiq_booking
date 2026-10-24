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
  cancelBooking,
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

async function offerCreateSlots(params: {
  team_id: string;
  bot_id: string;
  session_id: string;
  contact_id: string;
  timezone: string;
  serviceName: string;
  intro: string;
  selection: unknown;
  uiExtra?: Record<string, unknown>;
}): Promise<BookingTurnResponse> {
  const taken = await listTakenStarts({
    team_id: params.team_id,
    bot_id: params.bot_id,
  });
  const slots = generateOfferSlots({
    timeZone: params.timezone,
    takenStarts: taken,
  });
  if (slots.length === 0) {
    return okReply({
      reply_text: `Sorry — no open ${params.serviceName} slots in the next few days. Try again later.`,
      session_id: params.session_id,
      contact_id: params.contact_id,
      ui: { command: "booking.create", selection: params.selection },
    });
  }
  await updateSessionStep(params.session_id, encodeOfferedSlots(slots));
  return okReply({
    reply_text: `${params.intro}\n${formatSlotList(slots)}`,
    session_id: params.session_id,
    contact_id: params.contact_id,
    ui: {
      command: "booking.create",
      slots,
      selection: params.selection,
      ...params.uiExtra,
    },
  });
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
      name: body.contact_profile?.name,
      email: body.contact_profile?.email,
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

    // Confirm cancel step
    if (session.step.startsWith("confirm_cancel:")) {
      const bookingId = session.step.slice("confirm_cancel:".length);
      if (/^(yes|y|confirm|ok|sure)$/i.test(text)) {
        const cancelled = await cancelBooking({
          booking_id: bookingId,
          notes: "cancelled by customer (confirmed)",
        });
        await updateSessionStep(session.id, "stub_welcome");
        return okReply({
          reply_text: cancelled
            ? `Cancelled your ${serviceName}. Say “book” anytime to schedule again.`
            : `That booking is no longer active. Say “book” to schedule a new one.`,
          session_id: session.id,
          contact_id: contact.id,
          ui: {
            command: "booking.cancel",
            booking_id: bookingId,
            status: cancelled?.status ?? "cancelled",
            selection,
          },
        });
      }
      if (/^(no|n|nevermind|keep)$/i.test(text)) {
        await updateSessionStep(session.id, existing ? "booked" : "stub_welcome");
        return okReply({
          reply_text: `Okay — I kept your ${serviceName}.`,
          session_id: session.id,
          contact_id: contact.id,
          ui: { command: "booking.cancel", cancelled: false, selection },
        });
      }
      return okReply({
        reply_text: `Please reply yes to cancel, or no to keep your booking.`,
        session_id: session.id,
        contact_id: contact.id,
        ui: { command: "booking.cancel", selection },
      });
    }

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
          "Did you want to book a new appointment, check an existing one, cancel, or reschedule?",
        session_id: session.id,
        contact_id: contact.id,
        ui: { command: "booking.clarify", selection },
      });
    }

    if (selection.command === "booking.faq") {
      return okReply({
        reply_text: `For this pilot you can book a ${serviceName}, check an existing booking, cancel it, or reschedule to a new slot.`,
        session_id: session.id,
        contact_id: contact.id,
        ui: { command: "booking.faq", selection },
      });
    }

    if (selection.command === "booking.cancel") {
      if (!existing?.starts_at) {
        return okReply({
          reply_text: `There’s no upcoming ${serviceName} to cancel. Say “book” to schedule one.`,
          session_id: session.id,
          contact_id: contact.id,
          ui: { command: "booking.cancel", selection },
        });
      }
      await updateSessionStep(session.id, `confirm_cancel:${existing.id}`);
      return okReply({
        reply_text: `Cancel your ${serviceName} on ${formatWhen(existing.starts_at, existing.timezone || timezone)}? Reply yes or no.`,
        session_id: session.id,
        contact_id: contact.id,
        ui: {
          command: "booking.cancel",
          booking_id: existing.id,
          selection,
        },
      });
    }

    if (selection.command === "booking.reschedule") {
      if (!existing?.starts_at) {
        return okReply({
          reply_text: `There’s no upcoming ${serviceName} to reschedule. Say “book” to schedule one.`,
          session_id: session.id,
          contact_id: contact.id,
          ui: { command: "booking.reschedule", selection },
        });
      }
      // Cancel current, then offer new slots in the same turn.
      await cancelBooking({
        booking_id: existing.id,
        notes: "cancelled for reschedule",
      });
      await updateSessionStep(session.id, "stub_welcome");
      return offerCreateSlots({
        team_id: body.team_id,
        bot_id: body.bot_id,
        session_id: session.id,
        contact_id: contact.id,
        timezone,
        serviceName,
        intro: `Rescheduling your ${serviceName}. Pick a new time (reply with 1, 2, or 3):`,
        selection,
        uiExtra: {
          command: "booking.reschedule",
          previous_booking_id: existing.id,
        },
      });
    }

    // booking.create
    const wantsNew = /\bnew\b/i.test(text);
    if ((session.step === "booked" || existing) && !wantsNew) {
      if (existing?.starts_at) {
        return okReply({
          reply_text: `You already have a ${serviceName} booked for ${formatWhen(existing.starts_at, existing.timezone || timezone)}. Reply "new" if you want another appointment, or ask to check / cancel / reschedule.`,
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

    if (wantsNew && (session.step === "booked" || existing)) {
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
          return offerCreateSlots({
            team_id: body.team_id,
            bot_id: body.bot_id,
            session_id: session.id,
            contact_id: contact.id,
            timezone,
            serviceName,
            intro: `Sorry — that time was just taken. Pick another:`,
            selection,
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

    return offerCreateSlots({
      team_id: body.team_id,
      bot_id: body.bot_id,
      session_id: session.id,
      contact_id: contact.id,
      timezone,
      serviceName,
      intro: text
        ? `Great — let's book a ${serviceName}. Pick a time (reply with 1, 2, or 3):`
        : `Ready to book a ${serviceName}. Pick a time (reply with 1, 2, or 3):`,
      selection,
    });
  } catch (err) {
    console.error("[booking] supabase turn failed, falling back to mock", err);
    return handleMockTurn(body);
  }
}
