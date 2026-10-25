/**
 * Appointments + resources: slot search scoped per clinician/room.
 * One resource per booking (multi-resource linking is later).
 */
import {
  searchAvailability,
  type BusyInterval,
  type DateException,
  type LocalWindow,
  type OfferSlot,
  type TimeOfDay,
} from "@/lib/availability";
import type { DbResource } from "@/lib/supabase/resources";

export type ResourceOfferSlot = OfferSlot & {
  resource_id: string;
  resource_slug: string;
  resource_title: string;
  resource_kind: string;
};

export async function searchAvailabilityForResources(params: {
  timeZone: string;
  now?: Date;
  count?: number;
  dateFrom?: string;
  dateTo?: string;
  timeOfDay?: TimeOfDay;
  hoursByWeekday: Map<number, LocalWindow[]>;
  exceptions?: DateException[];
  blocks?: BusyInterval[];
  durationMinutes: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  slotStepMinutes?: number;
  minNoticeMinutes?: number;
  bookingHorizonDays?: number;
  resources: DbResource[];
  /** resource_id → occupied intervals (with buffers already applied). */
  occupiedByResource: Map<string, BusyInterval[]>;
}): Promise<ResourceOfferSlot[]> {
  const count = Math.min(5, Math.max(1, params.count ?? 3));
  const byStart = new Map<string, ResourceOfferSlot>();

  for (const resource of params.resources) {
    const found = searchAvailability({
      timeZone: params.timeZone,
      now: params.now,
      count,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      timeOfDay: params.timeOfDay,
      hoursByWeekday: params.hoursByWeekday,
      exceptions: params.exceptions,
      blocks: params.blocks,
      occupied: params.occupiedByResource.get(resource.id) ?? [],
      durationMinutes: params.durationMinutes,
      bufferBeforeMinutes: params.bufferBeforeMinutes,
      bufferAfterMinutes: params.bufferAfterMinutes,
      capacity: 1,
      slotStepMinutes: params.slotStepMinutes,
      minNoticeMinutes: params.minNoticeMinutes,
      bookingHorizonDays: params.bookingHorizonDays,
    });
    for (const slot of found) {
      if (byStart.has(slot.starts_at)) continue;
      byStart.set(slot.starts_at, {
        ...slot,
        resource_id: resource.id,
        resource_slug: resource.slug,
        resource_title: resource.title,
        resource_kind: resource.kind,
      });
    }
  }

  return [...byStart.values()]
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
    )
    .slice(0, count)
    .map((s, i) => ({ ...s, index: i + 1 }));
}

export function isResourceFreeAt(params: {
  starts_at: string;
  durationMinutes: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  occupied: BusyInterval[];
}): boolean {
  const startMs = new Date(params.starts_at).getTime();
  const before = Math.max(0, params.bufferBeforeMinutes ?? 0);
  const after = Math.max(0, params.bufferAfterMinutes ?? 0);
  const blockStart = startMs - before * 60_000;
  const blockEnd =
    startMs + (params.durationMinutes + after) * 60_000;
  return !params.occupied.some((o) => {
    const oStart = new Date(o.starts_at).getTime();
    const oEnd = new Date(o.ends_at).getTime();
    return blockStart < oEnd && oStart < blockEnd;
  });
}
