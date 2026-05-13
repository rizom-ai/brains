import { z } from "@brains/utils";
import { StructuredContentFormatter } from "@brains/content-formatters";
import { baseEntitySchema } from "@brains/entity-service";

/**
 * Series frontmatter schema (stored in content as YAML frontmatter)
 */
export const seriesFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string(),
  coverImageId: z.string().optional(),
});

export type SeriesFrontmatter = z.infer<typeof seriesFrontmatterSchema>;

/**
 * Series metadata schema (searchable fields only)
 */
export const seriesMetadataSchema = seriesFrontmatterSchema.pick({
  title: true,
  slug: true,
});

export type SeriesMetadata = z.infer<typeof seriesMetadataSchema>;

/**
 * Series entity schema
 */
export const seriesSchema = baseEntitySchema.extend({
  metadata: seriesMetadataSchema,
});

export type Series = z.infer<typeof seriesSchema>;

/**
 * Series with parsed frontmatter (returned by datasource)
 */
export const seriesWithDataSchema = seriesSchema.extend({
  frontmatter: seriesFrontmatterSchema,
});

export type SeriesWithData = z.infer<typeof seriesWithDataSchema>;

/**
 * Series list item schema (for templates)
 */
export const seriesListItemSchema = seriesWithDataSchema.extend({
  description: z.string().optional(),
  postCount: z.number(),
  coverImageUrl: z.string().optional(),
  coverImageWidth: z.number().optional(),
  coverImageHeight: z.number().optional(),
});

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
