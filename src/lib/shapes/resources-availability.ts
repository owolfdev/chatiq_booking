/**
 * Appointments + resources: slot search scoped per clinician/room.
 * Multi-resource linking: require one free resource per required kind.
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
  /** All assigned resources when linking (person+room). */
  resources?: Array<{
    id: string;
    slug: string;
    title: string;
    kind: string;
  }>;
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
  /** When set (e.g. person+room), assign one free resource of each kind. */
  requireKinds?: string[];
  /** Optional pinned resource ids (must be eligible and free). */
  pinnedResourceIds?: string[];
}): Promise<ResourceOfferSlot[]> {
  const requireKinds = (params.requireKinds ?? []).filter(Boolean);
  if (requireKinds.length >= 2) {
    return searchAvailabilityLinked(params, requireKinds);
  }

  const count = Math.min(5, Math.max(1, params.count ?? 3));
  const byStart = new Map<string, ResourceOfferSlot>();
  const pool = params.resources;

  for (const resource of pool) {
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
        resources: [
          {
            id: resource.id,
            slug: resource.slug,
            title: resource.title,
            kind: resource.kind,
          },
        ],
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

function searchAvailabilityLinked(
  params: Parameters<typeof searchAvailabilityForResources>[0],
  requireKinds: string[]
): ResourceOfferSlot[] {
  const count = Math.min(5, Math.max(1, params.count ?? 3));
  const pinned = new Set(params.pinnedResourceIds ?? []);
  const byKind = new Map<string, DbResource[]>();
  for (const kind of requireKinds) {
    const pool = params.resources.filter((r) => r.kind === kind);
    byKind.set(kind, pool);
    if (pool.length === 0) return [];
  }

  // Anchor on the first required kind (usually person).
  const anchorKind = requireKinds[0]!;
  let anchors = byKind.get(anchorKind) ?? [];
  if (pinned.size > 0) {
    const pinnedAnchors = anchors.filter((r) => pinned.has(r.id));
    if (pinnedAnchors.length > 0) anchors = pinnedAnchors;
  }

  const byStart = new Map<string, ResourceOfferSlot>();

  for (const anchor of anchors) {
    const found = searchAvailability({
      timeZone: params.timeZone,
      now: params.now,
      count: Math.max(count, 5),
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      timeOfDay: params.timeOfDay,
      hoursByWeekday: params.hoursByWeekday,
      exceptions: params.exceptions,
      blocks: params.blocks,
      occupied: params.occupiedByResource.get(anchor.id) ?? [],
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
      const assigned: DbResource[] = [anchor];
      let ok = true;
      for (const kind of requireKinds.slice(1)) {
        let pool = byKind.get(kind) ?? [];
        const pinnedForKind = pool.filter((r) => pinned.has(r.id));
        if (pinnedForKind.length > 0) pool = pinnedForKind;
        const free = pool.find((r) =>
          isResourceFreeAt({
            starts_at: slot.starts_at,
            durationMinutes: params.durationMinutes,
            bufferBeforeMinutes: params.bufferBeforeMinutes,
            bufferAfterMinutes: params.bufferAfterMinutes,
            occupied: params.occupiedByResource.get(r.id) ?? [],
          })
        );
        if (!free) {
          ok = false;
          break;
        }
        assigned.push(free);
      }
      if (!ok) continue;

      const primary =
        assigned.find((r) => r.kind === "person") ?? assigned[0]!;
      byStart.set(slot.starts_at, {
        ...slot,
        resource_id: primary.id,
        resource_slug: primary.slug,
        resource_title: primary.title,
        resource_kind: primary.kind,
        resources: assigned.map((r) => ({
          id: r.id,
          slug: r.slug,
          title: r.title,
          kind: r.kind,
        })),
      });
      if (byStart.size >= count) break;
    }
    if (byStart.size >= count) break;
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

/** Pick one free resource per required kind at a starts_at. */
export function assignLinkedResourcesAt(params: {
  starts_at: string;
  durationMinutes: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  eligible: DbResource[];
  requireKinds: string[];
  occupiedByResource: Map<string, BusyInterval[]>;
  pinnedResourceIds?: string[];
}): DbResource[] | null {
  const pinned = new Set(params.pinnedResourceIds ?? []);
  const assigned: DbResource[] = [];
  for (const kind of params.requireKinds) {
    let pool = params.eligible.filter((r) => r.kind === kind);
    const pinnedForKind = pool.filter((r) => pinned.has(r.id));
    if (pinnedForKind.length > 0) pool = pinnedForKind;
    const free = pool.find((r) =>
      isResourceFreeAt({
        starts_at: params.starts_at,
        durationMinutes: params.durationMinutes,
        bufferBeforeMinutes: params.bufferBeforeMinutes,
        bufferAfterMinutes: params.bufferAfterMinutes,
        occupied: params.occupiedByResource.get(r.id) ?? [],
      })
    );
    if (!free) return null;
    assigned.push(free);
  }
  return assigned;
}
