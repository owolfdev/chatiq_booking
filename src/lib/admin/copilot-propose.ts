/**
 * Admin copilot: natural language → proposed command card.
 * Never mutates. Callers must Confirm before executeBookingCommand.
 */
import { COMMAND_CATALOG, type CommandEntry } from "@/lib/admin/command-catalog";

export type CopilotProposal = {
  kind: "command" | "clarify" | "unsupported";
  summary: string;
  command?: string;
  slots?: Record<string, unknown>;
  mutating?: boolean;
  clarify_question?: string;
  engine: "llm" | "heuristic";
};

const STAFF_COMMANDS = COMMAND_CATALOG.filter(
  (c) => c.actor === "staff" || c.actor === "both"
);

function catalogBrief(): string {
  return STAFF_COMMANDS.map(
    (c) =>
      `- ${c.id} (${c.mutating ? "mutates" : "read"}) slots=[${c.slots.join(", ")}] — ${c.summary}`
  ).join("\n");
}

function findCommand(id: string): CommandEntry | undefined {
  return STAFF_COMMANDS.find((c) => c.id === id);
}

function uuidIn(text: string): string | null {
  const m =
    /\b([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\b/i.exec(
      text
    );
  return m?.[1] ?? null;
}

/** Deterministic fallback when no OpenAI key (and smoke tests). */
export function proposeHeuristic(message: string): CopilotProposal {
  const text = message.trim();
  const lower = text.toLowerCase();
  const bookingId = uuidIn(text);

  if (
    /\b(list|show|what)\b.*\bservices?\b/.test(lower) ||
    /\bservices?\b.*\b(list|show|do we (have|offer))\b/.test(lower) ||
    lower === "services" ||
    lower === "list services"
  ) {
    return {
      kind: "command",
      summary: "List catalog services (including inactive).",
      command: "booking.list_services",
      slots: { include_inactive: true },
      mutating: false,
      engine: "heuristic",
    };
  }

  if (
    /\b(hours|schedule|opening|open times|availability settings)\b/.test(lower) &&
    !/\b(book|cancel|reschedule)\b/.test(lower)
  ) {
    return {
      kind: "command",
      summary: "Read weekly hours, exceptions, and blocks.",
      command: "availability.get_schedule",
      slots: {},
      mutating: false,
      engine: "heuristic",
    };
  }

  if (/\b(cancel|void)\b/.test(lower) && bookingId) {
    return {
      kind: "command",
      summary: `Cancel booking ${bookingId}.`,
      command: "booking.cancel",
      slots: { booking_id: bookingId, confirmed: true },
      mutating: true,
      engine: "heuristic",
    };
  }

  if (/\b(no[- ]?show|noshow|didn.?t (show|come))\b/.test(lower) && bookingId) {
    return {
      kind: "command",
      summary: `Mark booking ${bookingId} as no-show.`,
      command: "booking.mark_no_show",
      slots: { booking_id: bookingId, confirmed: true },
      mutating: true,
      engine: "heuristic",
    };
  }

  if (/\b(cancel|void|no[- ]?show)\b/.test(lower) && !bookingId) {
    return {
      kind: "clarify",
      summary: "Need a booking id to cancel or mark no-show.",
      clarify_question:
        "Paste the booking id from Schedule (or open the booking and copy it).",
      engine: "heuristic",
    };
  }

  if (/\baudit\b|\bwho changed\b|\brecent changes\b/.test(lower)) {
    return {
      kind: "command",
      summary: "List recent mutating command audit rows for this bot.",
      command: "booking.admin_list_command_audit",
      slots: { bot_scoped: true, limit: 20 },
      mutating: false,
      engine: "heuristic",
    };
  }

  return {
    kind: "unsupported",
    summary:
      "I couldn't map that to a known staff command. Try “list services”, “show hours”, “cancel <booking-id>”, or “recent audit”.",
    engine: "heuristic",
  };
}

type LlmJson = {
  kind?: string;
  summary?: string;
  command?: string;
  slots?: Record<string, unknown>;
  clarify_question?: string;
};

async function proposeWithOpenAI(
  message: string,
  apiKey: string
): Promise<CopilotProposal | null> {
  const system = `You are the ChatIQ booking admin copilot. Map the staff request to ONE JSON object only (no markdown).

Allowed commands (staff may run these):
${catalogBrief()}

Rules:
- Return {"kind":"command","summary":"...","command":"<id>","slots":{...}} for a concrete operation.
- Mutating booking.cancel / booking.reschedule / booking.mark_no_show / booking.admin_unmerge MUST include "confirmed": true in slots when proposing (human still confirms in UI).
- If missing required ids (booking_id, audit_id, starts_at), return {"kind":"clarify","summary":"...","clarify_question":"..."}.
- If you cannot map safely: {"kind":"unsupported","summary":"..."}.
- Never invent booking ids or times. Prefer clarify over guessing.
- slots values must be JSON-serializable primitives or small objects/arrays.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.BOOKING_COPILOT_MODEL?.trim() || "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: message },
      ],
    }),
  });

  if (!res.ok) {
    console.warn("[copilot] OpenAI error", res.status, await res.text().catch(() => ""));
    return null;
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) return null;

  let parsed: LlmJson;
  try {
    parsed = JSON.parse(raw) as LlmJson;
  } catch {
    return null;
  }

  const kind =
    parsed.kind === "command" ||
    parsed.kind === "clarify" ||
    parsed.kind === "unsupported"
      ? parsed.kind
      : "unsupported";

  if (kind === "command") {
    const entry = parsed.command ? findCommand(parsed.command) : undefined;
    if (!entry) {
      return {
        kind: "clarify",
        summary: "Suggested an unknown command.",
        clarify_question: "Try again with a simpler request (e.g. list services).",
        engine: "llm",
      };
    }
    const slots = { ...(parsed.slots ?? {}) };
    if (
      entry.mutating &&
      (entry.id === "booking.cancel" ||
        entry.id === "booking.reschedule" ||
        entry.id === "booking.mark_no_show" ||
        entry.id === "booking.admin_unmerge") &&
      slots.confirmed !== true
    ) {
      slots.confirmed = true;
    }
    return {
      kind: "command",
      summary: parsed.summary?.trim() || entry.summary,
      command: entry.id,
      slots,
      mutating: entry.mutating,
      engine: "llm",
    };
  }

  if (kind === "clarify") {
    return {
      kind: "clarify",
      summary: parsed.summary?.trim() || "Need more detail.",
      clarify_question:
        parsed.clarify_question?.trim() || "What would you like to do?",
      engine: "llm",
    };
  }

  return {
    kind: "unsupported",
    summary:
      parsed.summary?.trim() ||
      "I couldn't map that to a staff command safely.",
    engine: "llm",
  };
}

export async function proposeAdminCommand(
  message: string
): Promise<CopilotProposal> {
  const trimmed = message.trim();
  if (!trimmed) {
    return {
      kind: "clarify",
      summary: "Empty request.",
      clarify_question: "What would you like to do?",
      engine: "heuristic",
    };
  }

  const apiKey =
    process.env.BOOKING_COPILOT_OPENAI_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim();

  if (apiKey) {
    const llm = await proposeWithOpenAI(trimmed, apiKey);
    if (llm) return llm;
  }

  return proposeHeuristic(trimmed);
}
