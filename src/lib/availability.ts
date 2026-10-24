/**
 * Deterministic slot search for appointments shape.
 * Spec: service-catalog-and-availability.md §5.4
 */

export type OfferSlot = {
  index: number;
  starts_at: string; // ISO UTC
  label: string; // human label in local tz
};

export type TimeOfDay = "morning" | "afternoon" | "evening" | "any";

export type LocalWindow = { start_local: string; end_local: string };

export type HoursTemplateDay = {
  weekday: number; // 0=Sun … 6=Sat
  windows: LocalWindow[];
};

export type DateException = {
  on_date: string; // YYYY-MM-DD
  closed: boolean;
  start_local?: string | null;
  end_local?: string | null;
};

export type BusyInterval = {
  starts_at: string;
  ends_at: string;
};

function formatInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** Local calendar parts in a timezone. */
export function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: get("weekday"),
    hour: Number(get("hour") === "24" ? "0" : get("hour")),
    minute: Number(get("minute")),
  };
}

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Approximate UTC instant for local Y-M-D H:M in a timezone. */
export function localWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(guess, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
    const want = Date.UTC(year, month - 1, day, hour, minute, 0);
    guess = new Date(guess.getTime() + (want - asUtc));
  }
  return guess;
}

function addDays(year: number, month: number, day: number, delta: number) {
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseTimeToMinutes(value: string): number {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

function parseWindowDay(
  value: string | undefined,
  timeZone: string,
  fallback: Date
): { year: number; month: number; day: number } {
  if (value?.trim()) {
    const v = value.trim();
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (dateOnly) {
      return {
        year: Number(dateOnly[1]),
        month: Number(dateOnly[2]),
        day: Number(dateOnly[3]),
      };
    }
    const parsed = new Date(v);
    if (!Number.isNaN(parsed.getTime())) {
      const p = zonedParts(parsed, timeZone);
      return { year: p.year, month: p.month, day: p.day };
    }
  }
  const p = zonedParts(fallback, timeZone);
  return { year: p.year, month: p.month, day: p.day };
}

function dayDiff(
  a: { year: number; month: number; day: number },
  b: { year: number; month: number; day: number }
): number {
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) -
      Date.UTC(a.year, a.month - 1, a.day)) /
      86_400_000
  );
}

export function normalizeTimeOfDay(value: unknown): TimeOfDay {
  return value === "morning" || value === "afternoon" || value === "evening"
    ? value
    : "any";
}

function matchesTimeOfDay(hour: number, timeOfDay: TimeOfDay): boolean {
  if (timeOfDay === "any") return true;
  if (timeOfDay === "morning") return hour >= 5 && hour < 12;
  if (timeOfDay === "afternoon") return hour >= 12 && hour < 17;
  if (timeOfDay === "evening") return hour >= 17 && hour < 22;
  return true;
}

function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Filterable availability: weekly hours ∩ exceptions − blocks − capacity,
 * grid by slot_step, duration + buffers, min_notice, horizon. Max `count` (1–5).
 */
export function searchAvailability(params: {
  timeZone: string;
  now?: Date;
  count?: number;
  dateFrom?: string;
  dateTo?: string;
  timeOfDay?: TimeOfDay;
  /** Weekly template; empty → no open slots (fail closed). */
  hoursByWeekday: Map<number, LocalWindow[]>;
  exceptions?: DateException[];
  blocks?: BusyInterval[];
  /** Existing bookings as occupied intervals (including buffers already applied by caller). */
  occupied?: BusyInterval[];
  durationMinutes: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  capacity?: number;
  slotStepMinutes?: number;
  minNoticeMinutes?: number;
  bookingHorizonDays?: number;
}): OfferSlot[] {
  const timeZone = params.timeZone || "Asia/Bangkok";
  const now = params.now ?? new Date();
  const count = Math.min(5, Math.max(1, params.count ?? 3));
  const duration = Math.max(1, params.durationMinutes);
  const bufferBefore = Math.max(0, params.bufferBeforeMinutes ?? 0);
  const bufferAfter = Math.max(0, params.bufferAfterMinutes ?? 0);
  const capacity = Math.max(1, params.capacity ?? 1);
  const step = Math.max(5, params.slotStepMinutes ?? 30);
  const minNotice = Math.max(0, params.minNoticeMinutes ?? 60);
  const horizonDays = Math.max(1, params.bookingHorizonDays ?? 60);
  const timeOfDay = params.timeOfDay ?? "any";

  const exceptionByDate = new Map(
    (params.exceptions ?? []).map((e) => [e.on_date, e])
  );
  const blocks = params.blocks ?? [];
  const occupied = params.occupied ?? [];

  const earliest = now.getTime() + minNotice * 60_000;
  const horizonEnd = now.getTime() + horizonDays * 86_400_000;

  const startDay = parseWindowDay(params.dateFrom, timeZone, now);
  const defaultEnd = new Date(
    Math.min(horizonEnd, now.getTime() + 7 * 86_400_000)
  );
  const endDay = parseWindowDay(params.dateTo, timeZone, defaultEnd);
  const totalDays = Math.min(62, Math.max(0, dayDiff(startDay, endDay)));

  const slots: OfferSlot[] = [];

  for (let offset = 0; offset <= totalDays && slots.length < count; offset++) {
    const day = addDays(startDay.year, startDay.month, startDay.day, offset);
    const dateKey = ymd(day.year, day.month, day.day);
    const probe = localWallToUtc(day.year, day.month, day.day, 12, 0, timeZone);
    const weekdayName = zonedParts(probe, timeZone).weekday;
    const weekday = WEEKDAY_TO_INDEX[weekdayName] ?? 0;

    const exception = exceptionByDate.get(dateKey);
    let windows: LocalWindow[] = [];
    if (exception) {
      if (exception.closed) continue;
      if (exception.start_local && exception.end_local) {
        windows = [
          {
            start_local: exception.start_local,
            end_local: exception.end_local,
          },
        ];
      }
    } else {
      windows = params.hoursByWeekday.get(weekday) ?? [];
    }
    if (windows.length === 0) continue;

    for (const window of windows) {
      const startMin = parseTimeToMinutes(window.start_local);
      const endMin = parseTimeToMinutes(window.end_local);
      if (startMin < 0 || endMin <= startMin) continue;

      for (let minuteOfDay = startMin; minuteOfDay + duration <= endMin; minuteOfDay += step) {
        if (slots.length >= count) break;
        const hour = Math.floor(minuteOfDay / 60);
        const minute = minuteOfDay % 60;
        if (!matchesTimeOfDay(hour, timeOfDay)) continue;

        const starts = localWallToUtc(
          day.year,
          day.month,
          day.day,
          hour,
          minute,
          timeZone
        );
        const startsMs = starts.getTime();
        if (startsMs < earliest || startsMs > horizonEnd) continue;

        const serviceStart = startsMs;
        const serviceEnd = startsMs + duration * 60_000;
        const blockStart = serviceStart - bufferBefore * 60_000;
        const blockEnd = serviceEnd + bufferAfter * 60_000;

        const blocked = blocks.some((b) =>
          intervalsOverlap(
            blockStart,
            blockEnd,
            new Date(b.starts_at).getTime(),
            new Date(b.ends_at).getTime()
          )
        );
        if (blocked) continue;

        const overlapping = occupied.filter((o) =>
          intervalsOverlap(
            blockStart,
            blockEnd,
            new Date(o.starts_at).getTime(),
            new Date(o.ends_at).getTime()
          )
        ).length;
        if (overlapping >= capacity) continue;

        slots.push({
          index: slots.length + 1,
          starts_at: starts.toISOString(),
          label: formatInTimeZone(starts, timeZone),
        });
      }
    }
  }

  return slots;
}

/** Build weekday → windows map from flat hour rows. */
export function groupHoursByWeekday(
  rows: Array<{ weekday: number; start_local: string; end_local: string }>
): Map<number, LocalWindow[]> {
  const map = new Map<number, LocalWindow[]>();
  for (const row of rows) {
    const list = map.get(row.weekday) ?? [];
    list.push({ start_local: row.start_local, end_local: row.end_local });
    map.set(row.weekday, list);
  }
  return map;
}

/** Turn-handler helper: next open slots using hours template. */
export function generateOfferSlots(params: {
  timeZone: string;
  now?: Date;
  count?: number;
  hoursByWeekday: Map<number, LocalWindow[]>;
  occupied?: BusyInterval[];
  durationMinutes?: number;
  minNoticeMinutes?: number;
}): OfferSlot[] {
  return searchAvailability({
    timeZone: params.timeZone,
    now: params.now,
    count: params.count ?? 3,
    hoursByWeekday: params.hoursByWeekday,
    occupied: params.occupied,
    durationMinutes: params.durationMinutes ?? 30,
    minNoticeMinutes: params.minNoticeMinutes ?? 60,
    bookingHorizonDays: 21,
    slotStepMinutes: 30,
  });
}

export function formatSlotList(slots: OfferSlot[]): string {
  return slots.map((s) => `${s.index}) ${s.label}`).join("\n");
}

export function matchSlotChoice(
  text: string,
  slots: OfferSlot[]
): OfferSlot | null {
  const trimmed = text.trim();
  if (!trimmed || slots.length === 0) return null;

  const asNum = Number(trimmed);
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= slots.length) {
    return slots[asNum - 1] ?? null;
  }

  const lower = trimmed.toLowerCase();
  for (const slot of slots) {
    if (lower.includes(slot.label.toLowerCase())) return slot;
    if (lower.includes(slot.starts_at.slice(0, 10))) return slot;
  }
  return null;
}

export function encodeOfferedSlots(slots: OfferSlot[]): string {
  return `awaiting_slot:${slots.map((s) => s.starts_at).join(",")}`;
}

export function decodeOfferedSlots(
  step: string,
  timeZone: string
): OfferSlot[] | null {
  if (!step.startsWith("awaiting_slot:")) return null;
  const raw = step.slice("awaiting_slot:".length);
  if (!raw) return null;
  const isos = raw.split(",").filter(Boolean);
  return isos.map((starts_at, i) => ({
    index: i + 1,
    starts_at,
    label: formatInTimeZone(new Date(starts_at), timeZone),
  }));
}
