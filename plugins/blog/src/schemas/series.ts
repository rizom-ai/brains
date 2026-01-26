import { z, StructuredContentFormatter } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";

/**
 * Series frontmatter schema (stored in content as YAML frontmatter)
 * Contains all series data including coverImageId
 */
export const seriesFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string(),
  coverImageId: z.string().optional(),
});

export type SeriesFrontmatter = z.infer<typeof seriesFrontmatterSchema>;

/**
 * Series metadata schema (searchable fields only)
 * Derived from frontmatter using .pick() to stay in sync
 * Does NOT include coverImageId - that's read from frontmatter at runtime
 * Uses 'title' to satisfy CoverImageMetadata interface required by image_set-cover
 */
export const seriesMetadataSchema = seriesFrontmatterSchema.pick({
  title: true,
  slug: true,
});

/**
 * Series entity schema
 */
export const seriesSchema = baseEntitySchema.extend({
  metadata: seriesMetadataSchema,
});

/**
 * Series with parsed frontmatter (returned by datasource)
 */
export const seriesWithDataSchema = seriesSchema.extend({
  frontmatter: seriesFrontmatterSchema,
});

export type SeriesWithData = z.infer<typeof seriesWithDataSchema>;

/**
 * Series list item schema (for templates)
 * Includes resolved coverImageUrl from coverImageId
 */
export const seriesListItemSchema = z.object({
  title: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  postCount: z.number(),
  coverImageUrl: z.string().optional(),
});

export type Series = z.infer<typeof seriesSchema>;
export type SeriesMetadata = z.infer<typeof seriesMetadataSchema>;
export type SeriesListItem = z.infer<typeof seriesListItemSchema>;

/**
 * Series body schema (structured content in markdown body)
 */
export const seriesBodySchema = z.object({
  description: z.string().optional(),
});

export type SeriesBody = z.infer<typeof seriesBodySchema>;

/**
 * Create formatter for series content body
 */
export function createSeriesBodyFormatter(
  title: string,
): StructuredContentFormatter<SeriesBody> {
  return new StructuredContentFormatter(seriesBodySchema, {
    title,
    mappings: [{ key: "description", label: "Description", type: "string" }],
  });
}
