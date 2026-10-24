import { createBookingAdminClient } from "./admin";

export type CommandAuditVia = "ui" | "llm" | "api" | "system" | "cron";

export type CommandAuditRow = {
  id: string;
  team_id: string;
  bot_id: string;
  command: string;
  actor_type: string;
  actor_id: string | null;
  via: CommandAuditVia;
  contact_id: string | null;
  ok: boolean;
  error_code: string | null;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  slots_summary: Record<string, unknown>;
  created_at: string;
};

const REDACT_SLOT_KEYS = new Set([
  "code",
  "token",
  "connect_code",
  "short_code",
  "password",
  "secret",
]);

/** Drop secrets from slots before persisting. */
export function summarizeSlots(
  slots: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!slots) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(slots)) {
    if (REDACT_SLOT_KEYS.has(k)) {
      out[k] = "[redacted]";
      continue;
    }
    if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else if (Array.isArray(v)) {
      out[k] = v.slice(0, 20);
    } else if (typeof v === "object") {
      out[k] = "[object]";
    }
  }
  return out;
}

export async function writeCommandAudit(input: {
  team_id: string;
  bot_id: string;
  command: string;
  actor_type: string;
  actor_id?: string | null;
  via?: CommandAuditVia | string | null;
  contact_id?: string | null;
  ok?: boolean;
  error_code?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  slots?: Record<string, unknown> | null;
}): Promise<void> {
  const supabase = createBookingAdminClient();
  if (!supabase) return;

  const viaRaw = (input.via ?? "api").toString().toLowerCase();
  const via: CommandAuditVia =
    viaRaw === "ui" ||
    viaRaw === "llm" ||
    viaRaw === "system" ||
    viaRaw === "cron"
      ? viaRaw
      : "api";

  const { error } = await supabase.from("command_audit_log").insert({
    team_id: input.team_id,
    bot_id: input.bot_id,
    command: input.command,
    actor_type: input.actor_type,
    actor_id: input.actor_id ?? null,
    via,
    contact_id: input.contact_id ?? null,
    ok: input.ok !== false,
    error_code: input.error_code ?? null,
    before_state: input.before ?? {},
    after_state: input.after ?? {},
    slots_summary: summarizeSlots(input.slots),
  });
  if (error) {
    console.error("[booking] command_audit_log insert failed", error.message);
  }
}

export async function listCommandAudit(input: {
  team_id: string;
  bot_id?: string | null;
  command?: string | null;
  contact_id?: string | null;
  limit?: number;
}): Promise<CommandAuditRow[]> {
  const supabase = createBookingAdminClient();
  if (!supabase) return [];

  const limit =
    typeof input.limit === "number" && Number.isFinite(input.limit)
      ? Math.min(Math.max(Math.floor(input.limit), 1), 100)
      : 50;

  let query = supabase
    .from("command_audit_log")
    .select(
      "id, team_id, bot_id, command, actor_type, actor_id, via, contact_id, ok, error_code, before_state, after_state, slots_summary, created_at"
    )
    .eq("team_id", input.team_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (input.bot_id?.trim()) {
    query = query.eq("bot_id", input.bot_id.trim());
  }
  if (input.command?.trim()) {
    query = query.eq("command", input.command.trim());
  }
  if (input.contact_id?.trim()) {
    query = query.eq("contact_id", input.contact_id.trim());
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`command_audit_log list failed: ${error.message}`);
  }
  return (data ?? []) as CommandAuditRow[];
}
