/** Simple pilot availability: next weekdays at 10:00 and 14:00 in the session timezone. */

export type OfferSlot = {
  index: number;
  starts_at: string; // ISO UTC
  label: string; // human label in local tz
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
function zonedParts(date: Date, timeZone: string) {
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

/** Approximate UTC instant for local Y-M-D H:M in a timezone (good enough for pilot). */
function localWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  // Iterate from a UTC guess using the offset implied by formatting.
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

const WEEKEND = new Set(["Sat", "Sun"]);

export function generateOfferSlots(params: {
  timeZone: string;
  now?: Date;
  count?: number;
  takenStarts?: Set<string>;
}): OfferSlot[] {
  const timeZone = params.timeZone || "Asia/Bangkok";
  const now = params.now ?? new Date();
  const count = params.count ?? 3;
  const taken = params.takenStarts ?? new Set<string>();
  const nowParts = zonedParts(now, timeZone);

  const slots: OfferSlot[] = [];
  let dayOffset = 0;

  while (slots.length < count && dayOffset < 21) {
    const day = addDays(nowParts.year, nowParts.month, nowParts.day, dayOffset);
    const probe = localWallToUtc(day.year, day.month, day.day, 12, 0, timeZone);
    const weekday = zonedParts(probe, timeZone).weekday;
    if (!WEEKEND.has(weekday)) {
      for (const hour of [10, 14]) {
        if (slots.length >= count) break;
        const starts = localWallToUtc(
          day.year,
          day.month,
          day.day,
          hour,
          0,
          timeZone
        );
        if (starts.getTime() <= now.getTime() + 60 * 60 * 1000) continue;
        const iso = starts.toISOString();
        if (taken.has(iso)) continue;
        slots.push({
          index: slots.length + 1,
          starts_at: iso,
          label: formatInTimeZone(starts, timeZone),
        });
      }
    }
    dayOffset += 1;
  }

  return slots;
}

export type TimeOfDay = "morning" | "afternoon" | "evening" | "any";

export function normalizeTimeOfDay(value: unknown): TimeOfDay {
  return value === "morning" || value === "afternoon" || value === "evening"
    ? value
    : "any";
}

/** Pilot schedule hours (local) per time-of-day bucket. */
const TIME_OF_DAY_HOURS: Record<TimeOfDay, number[]> = {
  morning: [10],
  afternoon: [14],
  evening: [],
  any: [10, 14],
};

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

/**
 * Filterable availability for the commands API: explicit local date window +
 * optional time-of-day, future slots only, taken slots excluded.
 * Returns at most `count` (clamped 1–5) slots; empty array is a valid result.
 */
export function searchAvailability(params: {
  timeZone: string;
  now?: Date;
  count?: number;
  takenStarts?: Set<string>;
  dateFrom?: string;
  dateTo?: string;
  timeOfDay?: TimeOfDay;
}): OfferSlot[] {
  const timeZone = params.timeZone || "Asia/Bangkok";
  const now = params.now ?? new Date();
  const count = Math.min(5, Math.max(1, params.count ?? 3));
  const taken = params.takenStarts ?? new Set<string>();
  const hours = TIME_OF_DAY_HOURS[params.timeOfDay ?? "any"];

  const startDay = parseWindowDay(params.dateFrom, timeZone, now);
  const defaultEnd = new Date(now.getTime() + 7 * 86_400_000);
  const endDay = parseWindowDay(params.dateTo, timeZone, defaultEnd);
  const totalDays = Math.min(62, Math.max(0, dayDiff(startDay, endDay)));

  const slots: OfferSlot[] = [];
  for (let offset = 0; offset <= totalDays && slots.length < count; offset++) {
    const day = addDays(startDay.year, startDay.month, startDay.day, offset);
    const probe = localWallToUtc(day.year, day.month, day.day, 12, 0, timeZone);
    if (WEEKEND.has(zonedParts(probe, timeZone).weekday)) continue;
    for (const hour of hours) {
      if (slots.length >= count) break;
      const starts = localWallToUtc(day.year, day.month, day.day, hour, 0, timeZone);
      if (starts.getTime() <= now.getTime() + 60 * 60 * 1000) continue;
      const iso = starts.toISOString();
      if (taken.has(iso)) continue;
      slots.push({
        index: slots.length + 1,
        starts_at: iso,
        label: formatInTimeZone(starts, timeZone),
      });
    }
  }
  return slots;
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
    // match ISO date fragment
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
