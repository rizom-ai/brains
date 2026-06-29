import { z } from "@brains/utils/zod";
import { z as z4 } from "@brains/utils/zod-v4";
import { StructuredContentFormatter } from "@brains/content-formatters";
import { baseEntityParserSchema } from "@brains/plugins";

/**
 * Series frontmatter schema (stored in content as YAML frontmatter)
 */
export const seriesFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string(),
  coverImageId: z.string().optional(),
});

export type SeriesFrontmatter = z.output<typeof seriesFrontmatterSchema>;

/**
 * Series metadata schema (searchable fields only)
 */
export const seriesMetadataSchema = seriesFrontmatterSchema.pick({
  title: true,
  slug: true,
});

export type SeriesMetadata = z.output<typeof seriesMetadataSchema>;

const seriesEntityMetadataParserSchema = z4.object({
  title: z4.string(),
  slug: z4.string(),
});

const seriesFrontmatterParserSchema = z4.object({
  title: z4.string(),
  slug: z4.string(),
  coverImageId: z4.string().optional(),
});

/**
 * Series entity schema
 */
export const seriesSchema = baseEntityParserSchema.extend({
  entityType: z4.literal("series"),
  metadata: seriesEntityMetadataParserSchema,
});

export type Series = z4.output<typeof seriesSchema>;

/**
 * Series with parsed frontmatter (returned by datasource)
 */
export const seriesWithDataSchema = seriesSchema.extend({
  frontmatter: seriesFrontmatterParserSchema,
});

export type SeriesWithData = z4.output<typeof seriesWithDataSchema>;

/**
 * Series list item schema (for templates)
 */
export const seriesListItemSchema = seriesWithDataSchema.extend({
  description: z4.string().optional(),
  postCount: z4.number(),
  coverImageUrl: z4.string().optional(),
  coverImageWidth: z4.number().optional(),
  coverImageHeight: z4.number().optional(),
});

export type SeriesListItem = z4.output<typeof seriesListItemSchema>;

/**
 * Series body schema (structured content in markdown body)
 */
export const seriesBodySchema = z4.object({
  description: z4.string().optional(),
});

export type SeriesBody = z4.output<typeof seriesBodySchema>;

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
