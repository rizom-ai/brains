import { StructuredContentFormatter } from "@brains/content-formatters";
import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

type NullableStringSchema = z.ZodDefault<z.ZodNullable<z.ZodString>>;
type NullableNumberSchema = z.ZodDefault<z.ZodNullable<z.ZodNumber>>;

export const seriesFrontmatterSchema: z.ZodObject<{
  title: z.ZodString;
  slug: z.ZodString;
  coverImageId: NullableStringSchema;
}> = z.object({
  title: z.string(),
  slug: z.string(),
  coverImageId: z.string().nullable().default(null),
});

export type SeriesFrontmatter = z.output<typeof seriesFrontmatterSchema>;

/**
 * Series metadata schema (searchable fields only)
 */
export const seriesMetadataSchema: z.ZodObject<{
  title: z.ZodString;
  slug: z.ZodString;
}> = z.object({
  title: z.string(),
  slug: z.string(),
});

export type SeriesMetadata = z.output<typeof seriesMetadataSchema>;

/**
 * Series entity schema
 */
export const seriesSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"series">;
    metadata: typeof seriesMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("series"),
  metadata: seriesMetadataSchema,
});

export type Series = z.output<typeof seriesSchema>;

/**
 * Series with parsed frontmatter (returned by datasource)
 */
export const seriesWithDataSchema: ReturnType<
  typeof seriesSchema.extend<{
    frontmatter: typeof seriesFrontmatterSchema;
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
    description: NullableStringSchema;
    postCount: z.ZodNumber;
    coverImageUrl: NullableStringSchema;
    coverImageWidth: NullableNumberSchema;
    coverImageHeight: NullableNumberSchema;
  }>
> = seriesWithDataSchema.extend({
  description: z.string().nullable().default(null),
  postCount: z.number(),
  coverImageUrl: z.string().nullable().default(null),
  coverImageWidth: z.number().nullable().default(null),
  coverImageHeight: z.number().nullable().default(null),
});

export type SeriesListItem = z.output<typeof seriesListItemSchema>;

/**
 * Series body schema (structured content in markdown body)
 */
export const seriesBodySchema: z.ZodObject<{
  description: z.ZodOptional<z.ZodString>;
}> = z.object({
  description: z.string().optional(),
});

export type SeriesBody = z.output<typeof seriesBodySchema>;

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
