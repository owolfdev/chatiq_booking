import { NextResponse } from "next/server";

import {
  BOOKING_API_CONTRACT_VERSION,
  type BookingTurnRequest,
} from "@/lib/contract";
import { requireServiceAuth } from "@/lib/env";
import { handleTurn } from "@/lib/turn-handler";

export const runtime = "nodejs";

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

  const req = body as BookingTurnRequest;
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

  const result = await handleTurn({
    ...req,
    contract_version: BOOKING_API_CONTRACT_VERSION,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
