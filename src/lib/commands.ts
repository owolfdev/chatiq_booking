/**
 * Closed booking command catalog + heuristic speech-act classifier (v0).
 * Keep heuristics in sync with chatiq/src/lib/booking-sibling/commands.ts
 */

export const BOOKING_COMMANDS = [
  "booking.create",
  "booking.lookup",
  "booking.clarify",
  "booking.cancel",
  "booking.reschedule",
  "booking.faq",
] as const;

export type BookingCommand = (typeof BOOKING_COMMANDS)[number];

export function isBookingCommand(value: unknown): value is BookingCommand {
  return (
    typeof value === "string" &&
    (BOOKING_COMMANDS as readonly string[]).includes(value)
  );
}

export type CommandSelection = {
  command: BookingCommand;
  confidence: number;
  source: "client" | "heuristic" | "session_continue";
};

const LOOKUP_RE =
  /\b(check|already have|my booking|my appointment|do i have|what time|when is my|look up|lookup|status of)\b/i;
const CANCEL_RE = /\b(cancel|call off)\b.*\b(book|appointment|reservation)\b|\b(cancel my)\b/i;
const RESCHEDULE_RE = /\b(reschedule|change (my )?(time|slot|appointment)|move my)\b/i;
const FAQ_RE =
  /\b(how (does|do)|can i select|which provider|what services|policy|how much)\b/i;
const CREATE_RE =
  /\b(book|booking|appointment|schedule|reserve|make an? appointment)\b/i;
const SLOT_PICK_RE = /^[123]$/;

/**
 * Classify user text into a booking command.
 * Prefer explicit client command when valid.
 */
export function resolveBookingCommand(params: {
  messageText?: string | null;
  clientCommand?: string | null;
  clientConfidence?: number | null;
  sessionStep?: string | null;
}): CommandSelection {
  const step = params.sessionStep ?? "";
  const text = params.messageText?.trim() ?? "";

  if (step.startsWith("awaiting_slot:") || SLOT_PICK_RE.test(text)) {
    return {
      command: "booking.create",
      confidence: 1,
      source: "session_continue",
    };
  }

  if (isBookingCommand(params.clientCommand)) {
    return {
      command: params.clientCommand,
      confidence:
        typeof params.clientConfidence === "number"
          ? params.clientConfidence
          : 0.9,
      source: "client",
    };
  }

  if (!text) {
    return { command: "booking.clarify", confidence: 0.4, source: "heuristic" };
  }

  const lookup = LOOKUP_RE.test(text);
  const create = CREATE_RE.test(text);
  const cancel = CANCEL_RE.test(text);
  const reschedule = RESCHEDULE_RE.test(text);
  const faq = FAQ_RE.test(text);

  const hits = [
    lookup && "lookup",
    create && "create",
    cancel && "cancel",
    reschedule && "reschedule",
    faq && "faq",
  ].filter(Boolean);

  if (hits.length > 1) {
    // "check if I already have a booking" is lookup-dominant
    if (lookup && !/\b(want to|like to|make a)\b/i.test(text)) {
      return { command: "booking.lookup", confidence: 0.75, source: "heuristic" };
    }
    return { command: "booking.clarify", confidence: 0.55, source: "heuristic" };
  }

  if (cancel) {
    return { command: "booking.cancel", confidence: 0.7, source: "heuristic" };
  }
  if (reschedule) {
    return {
      command: "booking.reschedule",
      confidence: 0.7,
      source: "heuristic",
    };
  }
  if (faq) {
    return { command: "booking.faq", confidence: 0.65, source: "heuristic" };
  }
  if (lookup) {
    return { command: "booking.lookup", confidence: 0.8, source: "heuristic" };
  }
  if (create) {
    // Bare token → clarify rather than jump into create.
    if (/^(bookings?|appointments?|book)\??\.?$/i.test(text)) {
      return {
        command: "booking.clarify",
        confidence: 0.5,
        source: "heuristic",
      };
    }
    return { command: "booking.create", confidence: 0.8, source: "heuristic" };
  }

  return { command: "booking.clarify", confidence: 0.45, source: "heuristic" };
}
