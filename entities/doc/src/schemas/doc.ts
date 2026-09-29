import { baseEntityParserSchema, z } from "@brains/sdk/entities";

type NullableStringSchema = z.ZodDefault<z.ZodNullable<z.ZodString>>;

export const docFrontmatterSchema: z.ZodObject<{
  title: z.ZodString;
  section: z.ZodString;
  order: z.ZodNumber;
  sourcePath: z.ZodString;
  description: NullableStringSchema;
  slug: NullableStringSchema;
}> = z.object({
  title: z.string(),
  section: z.string(),
  order: z.number().int(),
  sourcePath: z.string(),
  description: z.string().nullable().default(null),
  slug: z.string().nullable().default(null),
});

export type DocFrontmatter = z.output<typeof docFrontmatterSchema>;

export const docMetadataSchema: z.ZodObject<{
  title: z.ZodString;
  section: z.ZodString;
  order: z.ZodNumber;
  sourcePath: z.ZodString;
  description: NullableStringSchema;
  slug: z.ZodString;
}> = z.object({
  title: z.string(),
  section: z.string(),
  order: z.number().int(),
  // Carried in metadata, not just frontmatter: the declarative markdown
  // codec encodes from metadata, so anything omitted here is lost on write.
  sourcePath: z.string(),
  description: z.string().nullable().default(null),
  slug: z.string(),
});

export type DocMetadata = z.output<typeof docMetadataSchema>;

export const docSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"doc">;
    metadata: typeof docMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("doc"),
  metadata: docMetadataSchema,
});

export type Doc = z.output<typeof docSchema>;

export const docWithDataSchema: ReturnType<
  typeof docSchema.extend<{
    frontmatter: typeof docFrontmatterSchema;
    body: z.ZodString;
  }>
> = docSchema.extend({
  frontmatter: docFrontmatterSchema,
  body: z.string(),
});

export type DocWithData = z.output<typeof docWithDataSchema>;
