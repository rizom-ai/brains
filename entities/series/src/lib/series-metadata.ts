import type { BaseEntity } from "@brains/plugins";
import { z } from "@brains/utils/zod";

/**
 * Helpers for reading the opt-in series fields that any entity type may carry
 * in its metadata. Centralized so the manager, datasource, and generation
 * handler all agree on how `seriesName`/`seriesIndex` are extracted, and so the
 * extraction goes through zod rather than unchecked casts.
 */
const seriesSourceMetadataSchema = z.object({
  seriesName: z.string().optional(),
  seriesIndex: z.number().optional(),
});

export type SeriesSourceFields = z.infer<typeof seriesSourceMetadataSchema>;

/** Parse the series fields out of a raw metadata object (or event payload). */
export function parseSeriesFields(metadata: unknown): SeriesSourceFields {
  const result = seriesSourceMetadataSchema.safeParse(metadata);
  return result.success ? result.data : {};
}

/** Extract `seriesName` from any entity's metadata, if present and a string. */
export function getSeriesName(entity: BaseEntity): string | undefined {
  return parseSeriesFields(entity.metadata).seriesName;
}

/** Extract `seriesIndex` from any entity's metadata, if present and a number. */
export function getSeriesIndex(entity: BaseEntity): number | undefined {
  return parseSeriesFields(entity.metadata).seriesIndex;
}

/**
 * Compare two entities by `seriesIndex` for stable ordering. Entities without
 * an index sort after those that have one (rather than being dropped or pinned
 * to an arbitrary magic position).
 */
export function compareBySeriesIndex(a: BaseEntity, b: BaseEntity): number {
  const ai = getSeriesIndex(a) ?? Number.MAX_SAFE_INTEGER;
  const bi = getSeriesIndex(b) ?? Number.MAX_SAFE_INTEGER;
  return ai - bi;
}
