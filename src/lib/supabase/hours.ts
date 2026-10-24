import { createBookingAdminClient } from "./admin";

export type BotBookingSettings = {
  team_id: string;
  bot_id: string;
  timezone: string;
  booking_horizon_days: number;
  min_notice_minutes: number;
  slot_step_minutes: number;
  shapes: string[];
};

export type HoursRow = {
  id: string;
  weekday: number;
  start_local: string; // HH:MM:SS or HH:MM
  end_local: string;
};

export type ExceptionRow = {
  id: string;
  on_date: string; // YYYY-MM-DD
  closed: boolean;
  start_local: string | null;
  end_local: string | null;
  note: string | null;
};

export type BlockRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
};

const DEFAULT_SETTINGS: Omit<BotBookingSettings, "team_id" | "bot_id"> = {
  timezone: "Asia/Bangkok",
  booking_horizon_days: 60,
  min_notice_minutes: 60,
  slot_step_minutes: 30,
  shapes: ["appointments"],
};

function normalizeTime(value: string): string {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) throw new Error(`Invalid time: ${value}`);
  const hh = String(Number(m[1])).padStart(2, "0");
  const mm = m[2];
  const ss = m[3] ?? "00";
  return `${hh}:${mm}:${ss}`;
}

export async function getBotBookingSettings(input: {
  team_id: string;
  bot_id: string;
}): Promise<BotBookingSettings> {
  const supabase = createBookingAdminClient();
  if (!supabase) {
    return { ...DEFAULT_SETTINGS, team_id: input.team_id, bot_id: input.bot_id };
  }
  const { data, error } = await supabase
    .from("bot_booking_settings")
    .select(
      "team_id, bot_id, timezone, booking_horizon_days, min_notice_minutes, slot_step_minutes, shapes"
    )
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id)
    .maybeSingle();
  if (error) throw new Error(`bot_booking_settings get failed: ${error.message}`);
  if (!data) {
    return { ...DEFAULT_SETTINGS, team_id: input.team_id, bot_id: input.bot_id };
  }
  const shapes = Array.isArray(data.shapes)
    ? (data.shapes as unknown[]).map(String)
    : DEFAULT_SETTINGS.shapes;
  return {
    team_id: data.team_id,
    bot_id: data.bot_id,
    timezone: data.timezone || DEFAULT_SETTINGS.timezone,
    booking_horizon_days: data.booking_horizon_days,
    min_notice_minutes: data.min_notice_minutes,
    slot_step_minutes: data.slot_step_minutes,
    shapes,
  };
}

export async function upsertBotBookingSettings(input: {
  team_id: string;
  bot_id: string;
  timezone?: string;
  booking_horizon_days?: number;
  min_notice_minutes?: number;
  slot_step_minutes?: number;
  shapes?: string[];
}): Promise<BotBookingSettings> {
  const supabase = createBookingAdminClient();
  if (!supabase) throw new Error("Supabase not configured");
  const current = await getBotBookingSettings(input);
  const row = {
    team_id: input.team_id,
    bot_id: input.bot_id,
    timezone: input.timezone?.trim() || current.timezone,
    booking_horizon_days:
      input.booking_horizon_days ?? current.booking_horizon_days,
    min_notice_minutes: input.min_notice_minutes ?? current.min_notice_minutes,
    slot_step_minutes: input.slot_step_minutes ?? current.slot_step_minutes,
    shapes: input.shapes ?? current.shapes,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("bot_booking_settings")
    .upsert(row, { onConflict: "team_id,bot_id" })
    .select(
      "team_id, bot_id, timezone, booking_horizon_days, min_notice_minutes, slot_step_minutes, shapes"
    )
    .single();
  if (error) throw new Error(`bot_booking_settings upsert failed: ${error.message}`);
  return {
    ...data,
    shapes: Array.isArray(data.shapes)
      ? (data.shapes as unknown[]).map(String)
      : DEFAULT_SETTINGS.shapes,
  } as BotBookingSettings;
}

export async function listHours(input: {
  team_id: string;
  bot_id: string;
}): Promise<HoursRow[]> {
  const supabase = createBookingAdminClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("availability_hours")
    .select("id, weekday, start_local, end_local")
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id)
    .order("weekday", { ascending: true })
    .order("start_local", { ascending: true });
  if (error) throw new Error(`availability_hours list failed: ${error.message}`);
  return (data ?? []) as HoursRow[];
}

/**
 * Replace weekly hours for a bot. Pass empty array to clear (closed always).
 * Each entry: { weekday: 0-6, start_local: "HH:MM", end_local: "HH:MM" }.
 */
export async function setHours(input: {
  team_id: string;
  bot_id: string;
  hours: Array<{ weekday: number; start_local: string; end_local: string }>;
}): Promise<HoursRow[]> {
  const supabase = createBookingAdminClient();
  if (!supabase) throw new Error("Supabase not configured");

  const rows = input.hours.map((h) => {
    if (!Number.isInteger(h.weekday) || h.weekday < 0 || h.weekday > 6) {
      throw new Error(`weekday must be 0–6 (got ${h.weekday})`);
    }
    const start_local = normalizeTime(h.start_local);
    const end_local = normalizeTime(h.end_local);
    if (end_local <= start_local) {
      throw new Error("end_local must be after start_local");
    }
    return {
      team_id: input.team_id,
      bot_id: input.bot_id,
      weekday: h.weekday,
      start_local,
      end_local,
    };
  });

  const { error: delError } = await supabase
    .from("availability_hours")
    .delete()
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id);
  if (delError) throw new Error(`availability_hours clear failed: ${delError.message}`);

  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from("availability_hours")
    .insert(rows)
    .select("id, weekday, start_local, end_local");
  if (error) throw new Error(`availability_hours insert failed: ${error.message}`);
  return (data ?? []) as HoursRow[];
}

/** Seed Mon–Fri 09:00–17:00 when the bot has no hours yet (pilot continuity). */
export async function ensureDefaultHoursIfEmpty(input: {
  team_id: string;
  bot_id: string;
}): Promise<HoursRow[]> {
  const existing = await listHours(input);
  if (existing.length > 0) return existing;
  const hours = [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    start_local: "09:00",
    end_local: "17:00",
  }));
  return setHours({ ...input, hours });
}

export async function setException(input: {
  team_id: string;
  bot_id: string;
  on_date: string;
  closed?: boolean;
  start_local?: string | null;
  end_local?: string | null;
  note?: string | null;
}): Promise<ExceptionRow> {
  const supabase = createBookingAdminClient();
  if (!supabase) throw new Error("Supabase not configured");
  const on_date = input.on_date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on_date)) {
    throw new Error("on_date must be YYYY-MM-DD");
  }
  const closed = input.closed !== false;
  const row = {
    team_id: input.team_id,
    bot_id: input.bot_id,
    on_date,
    closed,
    start_local:
      !closed && input.start_local ? normalizeTime(input.start_local) : null,
    end_local: !closed && input.end_local ? normalizeTime(input.end_local) : null,
    note: input.note?.trim() || null,
  };
  if (!closed && (!row.start_local || !row.end_local)) {
    throw new Error("open exceptions require start_local and end_local");
  }
  const { data, error } = await supabase
    .from("availability_exceptions")
    .upsert(row, { onConflict: "team_id,bot_id,on_date" })
    .select("id, on_date, closed, start_local, end_local, note")
    .single();
  if (error) throw new Error(`availability_exceptions upsert failed: ${error.message}`);
  return data as ExceptionRow;
}

export async function listExceptions(input: {
  team_id: string;
  bot_id: string;
  from_date?: string;
  to_date?: string;
}): Promise<ExceptionRow[]> {
  const supabase = createBookingAdminClient();
  if (!supabase) return [];
  let query = supabase
    .from("availability_exceptions")
    .select("id, on_date, closed, start_local, end_local, note")
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id)
    .order("on_date", { ascending: true });
  if (input.from_date) query = query.gte("on_date", input.from_date);
  if (input.to_date) query = query.lte("on_date", input.to_date);
  const { data, error } = await query;
  if (error) throw new Error(`availability_exceptions list failed: ${error.message}`);
  return (data ?? []) as ExceptionRow[];
}

export async function addBlock(input: {
  team_id: string;
  bot_id: string;
  starts_at: string;
  ends_at: string;
  reason?: string | null;
}): Promise<BlockRow> {
  const supabase = createBookingAdminClient();
  if (!supabase) throw new Error("Supabase not configured");
  const starts = new Date(input.starts_at);
  const ends = new Date(input.ends_at);
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
    throw new Error("starts_at and ends_at must be valid ISO timestamps");
  }
  if (ends.getTime() <= starts.getTime()) {
    throw new Error("ends_at must be after starts_at");
  }
  const { data, error } = await supabase
    .from("availability_blocks")
    .insert({
      team_id: input.team_id,
      bot_id: input.bot_id,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      reason: input.reason?.trim() || null,
    })
    .select("id, starts_at, ends_at, reason")
    .single();
  if (error) throw new Error(`availability_blocks insert failed: ${error.message}`);
  return data as BlockRow;
}

export async function removeBlock(input: {
  team_id: string;
  bot_id: string;
  block_id: string;
}): Promise<boolean> {
  const supabase = createBookingAdminClient();
  if (!supabase) throw new Error("Supabase not configured");
  const { error, count } = await supabase
    .from("availability_blocks")
    .delete({ count: "exact" })
    .eq("id", input.block_id)
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id);
  if (error) throw new Error(`availability_blocks delete failed: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function listBlocks(input: {
  team_id: string;
  bot_id: string;
  from?: string;
  to?: string;
}): Promise<BlockRow[]> {
  const supabase = createBookingAdminClient();
  if (!supabase) return [];
  let query = supabase
    .from("availability_blocks")
    .select("id, starts_at, ends_at, reason")
    .eq("team_id", input.team_id)
    .eq("bot_id", input.bot_id)
    .order("starts_at", { ascending: true });
  if (input.from) query = query.gte("ends_at", input.from);
  if (input.to) query = query.lte("starts_at", input.to);
  const { data, error } = await query;
  if (error) throw new Error(`availability_blocks list failed: ${error.message}`);
  return (data ?? []) as BlockRow[];
}
