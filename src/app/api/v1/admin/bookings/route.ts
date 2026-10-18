import { NextResponse } from "next/server";

import { BOOKING_API_CONTRACT_VERSION } from "@/lib/contract";
import { requireServiceAuth } from "@/lib/env";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { listRecentBookings } from "@/lib/supabase/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
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

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        contract_version: BOOKING_API_CONTRACT_VERSION,
        ok: false,
        error: "Supabase not configured",
        code: "NO_PERSISTENCE",
      },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const teamId = url.searchParams.get("team_id");
  const botId = url.searchParams.get("bot_id");

  try {
    const bookings = await listRecentBookings({
      team_id: teamId || undefined,
      bot_id: botId || undefined,
      limit: 50,
    });
    return NextResponse.json({
      contract_version: BOOKING_API_CONTRACT_VERSION,
      ok: true,
      bookings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "List failed";
    return NextResponse.json(
      {
        contract_version: BOOKING_API_CONTRACT_VERSION,
        ok: false,
        error: message,
        code: "LIST_FAILED",
      },
      { status: 500 }
    );
  }
}
