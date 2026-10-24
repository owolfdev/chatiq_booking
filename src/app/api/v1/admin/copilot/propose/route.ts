import { NextResponse } from "next/server";

import { proposeAdminCommand } from "@/lib/admin/copilot-propose";
import { requireServiceAuth } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!requireServiceAuth(request.headers.get("authorization"))) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  let body: { message?: unknown; team_id?: unknown; bot_id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON", code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }

  const message = typeof body.message === "string" ? body.message : "";
  if (!message.trim()) {
    return NextResponse.json(
      { ok: false, error: "message is required", code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }

  try {
    const proposal = await proposeAdminCommand(message);
    return NextResponse.json({
      ok: true,
      proposal,
      team_id: typeof body.team_id === "string" ? body.team_id : null,
      bot_id: typeof body.bot_id === "string" ? body.bot_id : null,
    });
  } catch (err) {
    console.error("[copilot] propose failed", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Propose failed",
        code: "EXECUTION_FAILED",
      },
      { status: 500 }
    );
  }
}
