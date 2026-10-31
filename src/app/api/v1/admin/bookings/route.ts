import { NextResponse } from "next/server";

import { BOOKING_API_CONTRACT_VERSION } from "@/lib/contract";
import { requireServiceAuth } from "@/lib/env";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { listAdminBookings } from "@/lib/supabase/store";

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
  const status = url.searchParams.get("status");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const q = url.searchParams.get("q");
  const orderRaw = url.searchParams.get("order");
  const limitRaw = url.searchParams.get("limit");
  const offsetRaw = url.searchParams.get("offset");
  const limit = limitRaw ? Number(limitRaw) : 25;
  const offset = offsetRaw ? Number(offsetRaw) : 0;
  const order =
    orderRaw === "starts_at_asc" ||
    orderRaw === "starts_at_desc" ||
    orderRaw === "created_at_asc" ||
    orderRaw === "created_at_desc"
      ? orderRaw
      : undefined;

  try {
    const page = await listAdminBookings({
      team_id: teamId || undefined,
      bot_id: botId || undefined,
      status: status
        ? status.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined,
      from: from || undefined,
      to: to || undefined,
      q: q || undefined,
      order,
      limit: Number.isFinite(limit) ? Math.min(100, Math.max(1, limit)) : 25,
      offset: Number.isFinite(offset) ? Math.max(0, offset) : 0,
    });
    return NextResponse.json({
      contract_version: BOOKING_API_CONTRACT_VERSION,
      ok: true,
      bookings: page.bookings,
      total: page.total,
      limit: page.limit,
      offset: page.offset,
      has_more: page.offset + page.bookings.length < page.total,
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
