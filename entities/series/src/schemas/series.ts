import { StructuredContentFormatter } from "@brains/content-formatters";
import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod-v4";

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- ZodObject shape aliases preserve named property inference without a broad index signature.
type SeriesFrontmatterShape = {
  title: z.ZodString;
  slug: z.ZodString;
  coverImageId: z.ZodOptional<z.ZodString>;
};

/**
 * Series frontmatter schema (stored in content as YAML frontmatter)
 */
export const seriesFrontmatterSchema: z.ZodObject<SeriesFrontmatterShape> =
  z.object({
    title: z.string(),
    slug: z.string(),
    coverImageId: z.string().optional(),
  });

export type SeriesFrontmatter = z.output<typeof seriesFrontmatterSchema>;

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- ZodObject shape aliases preserve named property inference without a broad index signature.
type SeriesMetadataShape = {
  title: z.ZodString;
  slug: z.ZodString;
};

/**
 * Series metadata schema (searchable fields only)
 */
export const seriesMetadataSchema: z.ZodObject<SeriesMetadataShape> = z.object({
  title: z.string(),
  slug: z.string(),
});

export type SeriesMetadata = z.output<typeof seriesMetadataSchema>;

const seriesEntityMetadataParserSchema: z.ZodObject<SeriesMetadataShape> =
  z.object({
    title: z.string(),
    slug: z.string(),
  });

/**
 * Series entity schema
 */
export const seriesSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"series">;
    metadata: z.ZodObject<SeriesMetadataShape>;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("series"),
  metadata: seriesEntityMetadataParserSchema,
});

export type Series = z.output<typeof seriesSchema>;

/**
 * Series with parsed frontmatter (returned by datasource)
 */
export const seriesWithDataSchema: ReturnType<
  typeof seriesSchema.extend<{
    frontmatter: z.ZodObject<SeriesFrontmatterShape>;
  }>
> = seriesSchema.extend({
  frontmatter: seriesFrontmatterSchema,
});

export type SeriesWithData = z.output<typeof seriesWithDataSchema>;

/**
 * Series list item schema (for templates)
 */
export const seriesListItemSchema: ReturnType<
  typeof seriesWithDataSchema.extend<{
    description: z.ZodOptional<z.ZodString>;
    postCount: z.ZodNumber;
    coverImageUrl: z.ZodOptional<z.ZodString>;
    coverImageWidth: z.ZodOptional<z.ZodNumber>;
    coverImageHeight: z.ZodOptional<z.ZodNumber>;
  }>
> = seriesWithDataSchema.extend({
  description: z.string().optional(),
  postCount: z.number(),
  coverImageUrl: z.string().optional(),
  coverImageWidth: z.number().optional(),
  coverImageHeight: z.number().optional(),
});

export type SeriesListItem = z.output<typeof seriesListItemSchema>;

export interface SeriesBody {
  description?: string | undefined;
}

/**
 * Series body schema (structured content in markdown body)
 */
export const seriesBodySchema: z.ZodType<SeriesBody> = z.object({
  description: z.string().optional(),
});

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
