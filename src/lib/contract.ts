/**
 * API contract v0 — ChatIQ ↔ chatiq-booking turn plugin.
 * Keep in sync with chatiq/src/lib/booking-sibling/types.ts
 */

export const BOOKING_API_CONTRACT_VERSION = "0" as const;

export type IdentityBindingClaim = {
  provider: string;
  external_id: string;
  verified?: boolean;
};

export type BookingTurnRequest = {
  contract_version: typeof BOOKING_API_CONTRACT_VERSION;
  team_id: string;
  bot_id: string;
  conversation_id?: string | null;
  channel?: string | null;
  message_text?: string | null;
  locale?: string | null;
  /** IANA timezone hint; pilot default Asia/Bangkok */
  timezone?: string | null;
  identity_claims?: IdentityBindingClaim[];
  session_id?: string | null;
  /** Closed catalog command; see commands.ts / booking-command-library.md */
  command?: string | null;
  /** Structured args for the command (v0 mostly unused) */
  slots?: Record<string, unknown> | null;
  /** 0–1 selection confidence from ChatIQ */
  confidence?: number | null;
};

export type BookingSurfaceDecision = "in_channel" | "handoff_required";

export type BookingTurnReply = {
  contract_version: typeof BOOKING_API_CONTRACT_VERSION;
  ok: true;
  reply_text: string;
  surface_decision: BookingSurfaceDecision;
  session_id: string;
  contact_id: string | null;
  /** Structured UI payload for handoff (stub: empty) */
  ui?: Record<string, unknown> | null;
  mock?: boolean;
};

export type BookingTurnError = {
  contract_version: typeof BOOKING_API_CONTRACT_VERSION;
  ok: false;
  error: string;
  code?: string;
};

export type BookingTurnResponse = BookingTurnReply | BookingTurnError;

export type BookingHealthResponse = {
  ok: true;
  service: "chatiq-booking";
  contract_version: typeof BOOKING_API_CONTRACT_VERSION;
  persistence: "mock" | "supabase";
  timezone_default: string;
};
