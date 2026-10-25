/**
 * Per-bot shape enablement (appointments / resources / stays).
 * Spec: base-and-shape-modules.md §4
 */

export const KNOWN_SHAPES = ["appointments", "resources", "stays"] as const;
export type KnownShape = (typeof KNOWN_SHAPES)[number];

export function isKnownShape(value: string): value is KnownShape {
  return (KNOWN_SHAPES as readonly string[]).includes(value);
}

/** Drop unknown ids; ensure appointments when resources is enabled. */
export function normalizeShapes(raw: unknown): KnownShape[] {
  const list = Array.isArray(raw)
    ? raw.map(String).filter(isKnownShape)
    : [];
  const set = new Set<KnownShape>(list.length ? list : ["appointments"]);
  if (set.has("resources")) set.add("appointments");
  return KNOWN_SHAPES.filter((s) => set.has(s));
}

export function botHasShape(
  shapes: string[] | null | undefined,
  shape: KnownShape
): boolean {
  return normalizeShapes(shapes).includes(shape);
}
