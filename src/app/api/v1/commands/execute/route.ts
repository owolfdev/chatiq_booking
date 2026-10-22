import { NextResponse } from "next/server";

import { executeBookingCommand } from "@/lib/command-execute";
import {
  BOOKING_API_CONTRACT_VERSION,
  type BookingCommandExecuteRequest,
} from "@/lib/contract";
import { requireServiceAuth } from "@/lib/env";

export const runtime = "nodejs";

function statusFor(code: string | undefined, ok: boolean): number {
  if (ok) return 200;
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "UNKNOWN_COMMAND":
    case "INVALID_REQUEST":
    case "SERVICE_NOT_FOUND":
    case "SERVICE_REQUIRED":
    case "IDENTITY_REQUIRED":
    case "CONFIRMATION_REQUIRED":
      return 400;
    case "BOOKING_NOT_FOUND":
    case "CONTACT_NOT_FOUND":
      return 404;
    case "SLOT_TAKEN":
    case "SLOT_IN_PAST":
    case "SAME_SLOT":
    case "BOOKING_NOT_ACTIVE":
    case "BOOKING_IN_PAST":
    case "TOKEN_USED":
    case "TOKEN_EXPIRED":
    case "MERGE_CONFLICT":
      return 409;
    case "TOKEN_INVALID":
      return 400;
    default:
      return 400;
  }
}

export async function POST(request: Request) {
  if (!requireServiceAuth(request.headers.get("authorization"))) {
    return NextResponse.json(
      {
        contract_version: BOOKING_API_CONTRACT_VERSION,
        ok: false,
        error: "Unauthorized",
        code: "UNAUTHORIZED",
      },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        contract_version: BOOKING_API_CONTRACT_VERSION,
        ok: false,
        error: "Invalid JSON body",
        code: "INVALID_JSON",
      },
      { status: 400 }
    );
  }

  const req = body as BookingCommandExecuteRequest;
  if (req.contract_version && req.contract_version !== BOOKING_API_CONTRACT_VERSION) {
    return NextResponse.json(
      {
        contract_version: BOOKING_API_CONTRACT_VERSION,
        ok: false,
        error: `Unsupported contract_version (expected ${BOOKING_API_CONTRACT_VERSION})`,
        code: "CONTRACT_MISMATCH",
      },
      { status: 400 }
    );
  }

  const result = await executeBookingCommand(req);
  return NextResponse.json(result, {
    status: statusFor(result.ok ? undefined : result.code, result.ok),
  });
}
