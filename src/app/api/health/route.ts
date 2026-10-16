import { NextResponse } from "next/server";

import {
  BOOKING_API_CONTRACT_VERSION,
  type BookingHealthResponse,
} from "@/lib/contract";
import { mockStoreStats } from "@/lib/mock/store";

export const runtime = "nodejs";

export async function GET() {
  const body: BookingHealthResponse & { mock_stats?: ReturnType<typeof mockStoreStats> } =
    {
      ok: true,
      service: "chatiq-booking",
      contract_version: BOOKING_API_CONTRACT_VERSION,
      persistence: "mock",
      timezone_default: "Asia/Bangkok",
      mock_stats: mockStoreStats(),
    };
  return NextResponse.json(body);
}
