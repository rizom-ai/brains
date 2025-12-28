import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/entity-service";

/**
 * Series metadata schema
 */
export const seriesMetadataSchema = z.object({
  name: z.string(),
  slug: z.string(),
  description: z.string().optional(),
});

/**
 * Series entity schema
 */
export const seriesSchema = baseEntitySchema.extend({
  metadata: seriesMetadataSchema,
});

export type Series = z.infer<typeof seriesSchema>;
export type SeriesMetadata = z.infer<typeof seriesMetadataSchema>;
