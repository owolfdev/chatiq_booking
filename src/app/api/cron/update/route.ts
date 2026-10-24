import { NextResponse } from "next/server";

import { requireCronAuth } from "@/lib/env";
import { createBookingAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Daily ping → insert one row into public."update".
 * Vercel Cron: Authorization Bearer CRON_SECRET (set CRON_SECRET in project env).
 */
async function handlePing(request: Request) {
  if (!requireCronAuth(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createBookingAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Supabase not configured" },
      { status: 503 }
    );
  }

  const source =
    request.headers.get("x-cron-source")?.trim() ||
    (request.headers.get("user-agent")?.includes("vercel-cron")
      ? "vercel_cron"
      : "manual");

  const { data, error } = await supabase
    .from("update")
    .insert({ source })
    .select("id, created_at, source")
    .single();

  if (error) {
    console.error("[cron/update] insert failed", error.message);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    ping: data,
  });
}

export async function GET(request: Request) {
  return handlePing(request);
}

export async function POST(request: Request) {
  return handlePing(request);
}
