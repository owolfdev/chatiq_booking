import type { AdminSession } from "./session";

export type AdminCommandResult =
  | { ok: true; command: string; data: Record<string, unknown> }
  | { ok: false; error: string; code?: string };

export async function executeAdminCommand(params: {
  session: AdminSession;
  command: string;
  slots?: Record<string, unknown>;
  timezone?: string;
  identity_claims?: Array<{
    provider: string;
    external_id: string;
    verified?: boolean;
  }>;
  contact_profile?: { name?: string | null; email?: string | null } | null;
}): Promise<AdminCommandResult> {
  const { session, command, slots, timezone, identity_claims, contact_profile } =
    params;
  if (!session.token.trim()) {
    return { ok: false, error: "Token required", code: "UNAUTHORIZED" };
  }
  if (!session.teamId.trim() || !session.botId.trim()) {
    return { ok: false, error: "team_id and bot_id required", code: "INVALID_REQUEST" };
  }

  const res = await fetch("/api/v1/commands/execute", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.token.trim()}`,
    },
    body: JSON.stringify({
      contract_version: "0",
      team_id: session.teamId.trim(),
      bot_id: session.botId.trim(),
      command,
      slots: slots ?? {},
      timezone: timezone ?? "Asia/Bangkok",
      actor: { type: "admin", id: "admin-console", via: "ui" },
      ...(identity_claims ? { identity_claims } : {}),
      ...(contact_profile ? { contact_profile } : {}),
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    command?: string;
    data?: Record<string, unknown>;
    error?: string;
    code?: string;
  };

  if (!res.ok || json.ok !== true) {
    return {
      ok: false,
      error: json.error || `HTTP ${res.status}`,
      code: json.code,
    };
  }
  return {
    ok: true,
    command: json.command ?? command,
    data: json.data ?? {},
  };
}
