import type { ContentVisibility } from "./types";

/**
 * Namespace a derived-entity ID by visibility tier so that the same logical
 * subject (e.g. a topic titled "Climate Change") can exist as separate
 * entities at public, shared, and restricted levels without ID collisions.
 *
 * Public keeps the bare id for back-compat with existing data.
 */
export function scopedDerivedId(
  baseId: string,
  visibility: ContentVisibility,
): string {
  return visibility === "public" ? baseId : `${baseId}-${visibility}`;
}
