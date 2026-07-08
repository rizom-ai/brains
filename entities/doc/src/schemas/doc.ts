import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

export const docFrontmatterSchema: z.ZodObject<{
  title: z.ZodString;
  section: z.ZodString;
  order: z.ZodNumber;
  sourcePath: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  slug: z.ZodOptional<z.ZodString>;
}> = z.object({
  title: z.string(),
  section: z.string(),
  order: z.number().int(),
  sourcePath: z.string(),
  description: z.string().optional(),
  slug: z.string().optional(),
});

export type DocFrontmatter = z.output<typeof docFrontmatterSchema>;

export const docMetadataSchema: z.ZodObject<{
  title: z.ZodString;
  section: z.ZodString;
  order: z.ZodNumber;
  description: z.ZodOptional<z.ZodString>;
  slug: z.ZodString;
}> = z.object({
  title: z.string(),
  section: z.string(),
  order: z.number().int(),
  description: z.string().optional(),
  slug: z.string(),
});

export type DocMetadata = z.output<typeof docMetadataSchema>;

const docEntityMetadataParserSchema: z.ZodObject<{
  title: z.ZodString;
  section: z.ZodString;
  order: z.ZodNumber;
  description: z.ZodOptional<z.ZodString>;
  slug: z.ZodString;
}> = z.object({
  title: z.string(),
  section: z.string(),
  order: z.number().int(),
  description: z.string().optional(),
  slug: z.string(),
});

export const docSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"doc">;
    metadata: typeof docEntityMetadataParserSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("doc"),
  metadata: docEntityMetadataParserSchema,
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
