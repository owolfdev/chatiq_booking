import { NextResponse } from "next/server";

import {
  BOOKING_API_CONTRACT_VERSION,
  type BookingHealthResponse,
} from "@/lib/contract";
import { mockStoreStats } from "@/lib/mock/store";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { probeSupabasePersistence } from "@/lib/supabase/store";

export const runtime = "nodejs";

export async function GET() {
  const configured = isSupabaseConfigured();
  let persistence: BookingHealthResponse["persistence"] = "mock";
  let supabase: { configured: boolean; reachable: boolean; error?: string } = {
    configured,
    reachable: false,
  };

  if (configured) {
    const probe = await probeSupabasePersistence();
    if (probe.ok) {
      persistence = "supabase";
      supabase = { configured: true, reachable: true };
    } else {
      supabase = {
        configured: true,
        reachable: false,
        error: probe.error,
      };
    }
  }

  const body: BookingHealthResponse & {
    mock_stats?: ReturnType<typeof mockStoreStats>;
    supabase?: typeof supabase;
  } = {
    ok: true,
    service: "chatiq-booking",
    contract_version: BOOKING_API_CONTRACT_VERSION,
    persistence,
    timezone_default: "Asia/Bangkok",
    supabase,
  };

  if (persistence === "mock") {
    body.mock_stats = mockStoreStats();
  }

  return NextResponse.json(body);
}
