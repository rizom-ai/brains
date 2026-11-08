import { StructuredContentFormatter } from "@brains/content-formatters";
import { z } from "@brains/sdk/entities";

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
 * A series' metadata: its frontmatter, decoded. The cover is carried here
 * too, since a declared type writes its frontmatter from its metadata.
 */
export const seriesMetadataSchema: z.ZodObject<{
  title: z.ZodString;
  slug: z.ZodString;
  coverImageId: NullableStringSchema;
}> = z.object({
  title: z.string(),
  slug: z.string(),
  coverImageId: z.string().nullable().default(null),
});

export type SeriesMetadata = z.output<typeof seriesMetadataSchema>;

/** A series as the series templates read it: its record and frontmatter. */
export const seriesListItemSchema: z.ZodObject<{
  id: z.ZodString;
  entityType: z.ZodLiteral<"series">;
  content: z.ZodString;
  created: z.ZodString;
  updated: z.ZodString;
  visibility: z.ZodEnum<{
    public: "public";
    shared: "shared";
    restricted: "restricted";
  }>;
  metadata: z.ZodObject<{ title: z.ZodString; slug: z.ZodString }>;
  contentHash: z.ZodString;
  frontmatter: typeof seriesFrontmatterSchema;
  description: NullableStringSchema;
  postCount: z.ZodNumber;
  coverImageUrl: NullableStringSchema;
  coverImageWidth: NullableNumberSchema;
  coverImageHeight: NullableNumberSchema;
}> = z.object({
  id: z.string(),
  entityType: z.literal("series"),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: z.enum(["public", "shared", "restricted"]),
  metadata: z.object({ title: z.string(), slug: z.string() }),
  contentHash: z.string(),
  frontmatter: seriesFrontmatterSchema,
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

/**
 * A series' body, read under its title. A body that does not read as one
 * answers empty, as the series adapter's did.
 */
export function parseSeriesBody(title: string, body: string): SeriesBody {
  try {
    return createSeriesBodyFormatter(title).parse(body);
  } catch {
    // A malformed body has no description to read, which is the same answer
    // as a body without one.
    return {};
  }
}
