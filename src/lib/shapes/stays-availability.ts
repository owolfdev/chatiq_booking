/**
 * Stays shape — availability by night range (half-open [check_in, check_out)).
 * Catalog item = room type; capacity = concurrent overlapping stays.
 */
import { localWallToUtc, zonedParts } from "@/lib/availability";

export type StayOccupied = {
  starts_at: string;
  ends_at: string;
};

export type StayOffer = {
  index: number;
  check_in: string; // YYYY-MM-DD local
  check_out: string;
  nights: number;
  starts_at: string; // ISO UTC (check-in local midnight)
  ends_at: string; // ISO UTC (check-out local midnight, exclusive)
  label: string;
  remaining: number;
};

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseYmd(value: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function addDays(
  year: number,
  month: number,
  day: number,
  delta: number
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
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

/** Local midnight UTC instant for a calendar date in timezone. */
export function stayDateToUtc(
  dateYmd: string,
  timeZone: string
): Date | null {
  const p = parseYmd(dateYmd);
  if (!p) return null;
  return localWallToUtc(p.year, p.month, p.day, 0, 0, timeZone);
}

/** Calendar YYYY-MM-DD in `timeZone` for a stay instant (usually local midnight). */
export function stayUtcToYmd(
  iso: string,
  timeZone: string
): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = zonedParts(d, timeZone);
  if (!Number.isFinite(p.year) || !Number.isFinite(p.month) || !Number.isFinite(p.day)) {
    return null;
  }
  return ymd(p.year, p.month, p.day);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = parseYmd(checkIn);
  const b = parseYmd(checkOut);
  if (!a || !b) return 0;
  return dayDiff(a, b);
}

/** Half-open range overlap on ISO instants. */
export function stayRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return (
    new Date(aStart).getTime() < new Date(bEnd).getTime() &&
    new Date(bStart).getTime() < new Date(aEnd).getTime()
  );
}

export function remainingStayCapacity(params: {
  checkInIso: string;
  checkOutIso: string;
  capacity: number;
  occupied: StayOccupied[];
}): number {
  const capacity = Math.max(1, params.capacity);
  const overlapping = params.occupied.filter((o) =>
    stayRangesOverlap(
      params.checkInIso,
      params.checkOutIso,
      o.starts_at,
      o.ends_at
    )
  ).length;
  return Math.max(0, capacity - overlapping);
}

function formatStayLabel(
  checkIn: string,
  checkOut: string,
  nights: number,
  timeZone: string
): string {
  const start = stayDateToUtc(checkIn, timeZone);
  if (!start) return `${checkIn} → ${checkOut} (${nights}n)`;
  const pretty = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(start);
  return `${pretty} → ${checkOut} (${nights} night${nights === 1 ? "" : "s"})`;
}

/**
 * Offer open check-in dates for a fixed night length, or validate one range.
 */
export function searchStayAvailability(params: {
  timeZone: string;
  now?: Date;
  count?: number;
  /** Exact range (both required for single-offer check). */
  checkIn?: string;
  checkOut?: string;
  /** When searching a window without exact checkout. */
  nights?: number;
  dateFrom?: string;
  dateTo?: string;
  capacity?: number;
  occupied?: StayOccupied[];
  minNoticeMinutes?: number;
  bookingHorizonDays?: number;
}): StayOffer[] {
  const timeZone = params.timeZone || "Asia/Bangkok";
  const now = params.now ?? new Date();
  const count = Math.min(5, Math.max(1, params.count ?? 3));
  const capacity = Math.max(1, params.capacity ?? 1);
  const occupied = params.occupied ?? [];
  const minNotice = Math.max(0, params.minNoticeMinutes ?? 0);
  const horizonDays = Math.max(1, params.bookingHorizonDays ?? 90);
  const earliest = now.getTime() + minNotice * 60_000;
  const horizonEnd = now.getTime() + horizonDays * 86_400_000;

  const offers: StayOffer[] = [];

  const pushIfOpen = (checkIn: string, checkOut: string) => {
    if (offers.length >= count) return;
    const nights = nightsBetween(checkIn, checkOut);
    if (nights < 1) return;
    const start = stayDateToUtc(checkIn, timeZone);
    const end = stayDateToUtc(checkOut, timeZone);
    if (!start || !end) return;
    const startsIso = start.toISOString();
    const endsIso = end.toISOString();
    if (start.getTime() < earliest || start.getTime() > horizonEnd) return;
    const remaining = remainingStayCapacity({
      checkInIso: startsIso,
      checkOutIso: endsIso,
      capacity,
      occupied,
    });
    if (remaining <= 0) return;
    offers.push({
      index: offers.length + 1,
      check_in: checkIn,
      check_out: checkOut,
      nights,
      starts_at: startsIso,
      ends_at: endsIso,
      label: formatStayLabel(checkIn, checkOut, nights, timeZone),
      remaining,
    });
  };

  if (params.checkIn && params.checkOut) {
    pushIfOpen(params.checkIn, params.checkOut);
    return offers;
  }

  const cinOnly = params.checkIn ? parseYmd(params.checkIn) : null;
  const fromDay = parseYmd(params.dateFrom ?? "");
  const toDay = parseYmd(params.dateTo ?? "");

  // date_from + date_to without nights → exact stay (hotel "Nov 5 to Nov 7").
  // Appointment-style windows with omitted nights used to default nights=1 and
  // return 1-night offers that models misread as the full multi-night range.
  if (fromDay && toDay && params.nights == null && !params.checkIn) {
    pushIfOpen(params.dateFrom!, params.dateTo!);
    return offers;
  }

  const nights = Math.max(1, Math.min(30, params.nights ?? 1));

  // check_in without check_out: treat as that exact stay (nights default 1).
  // Previously this fell through and searched from "tomorrow", ignoring check_in
  // — so "Nov 15 for 2 nights" returned late-Oct offers instead.
  if (cinOnly && !params.dateFrom && !params.dateTo) {
    const cout = addDays(cinOnly.year, cinOnly.month, cinOnly.day, nights);
    pushIfOpen(
      params.checkIn!,
      ymd(cout.year, cout.month, cout.day)
    );
    return offers;
  }

  const nowParts = zonedParts(now, timeZone);
  const startDay =
    fromDay ??
    cinOnly ??
    addDays(nowParts.year, nowParts.month, nowParts.day, 1);
  const defaultEnd = addDays(startDay.year, startDay.month, startDay.day, 14);
  const endDay = toDay ?? defaultEnd;
  const totalDays = Math.min(62, Math.max(0, dayDiff(startDay, endDay)));

  for (let offset = 0; offset <= totalDays && offers.length < count; offset++) {
    const cin = addDays(startDay.year, startDay.month, startDay.day, offset);
    const cout = addDays(cin.year, cin.month, cin.day, nights);
    pushIfOpen(ymd(cin.year, cin.month, cin.day), ymd(cout.year, cout.month, cout.day));
  }

  return offers;
}
