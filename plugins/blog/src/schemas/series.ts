import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/entity-service";

/**
 * Series metadata schema
 */
export const seriesMetadataSchema = z.object({
  name: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  coverImageId: z.string().optional(),
});

/**
 * Series entity schema
 */
export const seriesSchema = baseEntitySchema.extend({
  metadata: seriesMetadataSchema,
});

/**
 * Series list item schema (for templates)
 * Includes resolved coverImageUrl from coverImageId
 */
export const seriesListItemSchema = z.object({
  name: z.string(),
  slug: z.string(),
  postCount: z.number(),
  coverImageUrl: z.string().optional(),
});

export type Series = z.infer<typeof seriesSchema>;
export type SeriesMetadata = z.infer<typeof seriesMetadataSchema>;
export type SeriesListItem = z.infer<typeof seriesListItemSchema>;
