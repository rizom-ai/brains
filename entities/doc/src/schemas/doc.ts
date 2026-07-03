import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod-v4";

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- ZodObject shape aliases preserve named property inference without a broad index signature.
type DocFrontmatterShape = {
  title: z.ZodString;
  section: z.ZodString;
  order: z.ZodNumber;
  sourcePath: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  slug: z.ZodOptional<z.ZodString>;
};

export const docFrontmatterSchema: z.ZodObject<DocFrontmatterShape> = z.object({
  title: z.string(),
  section: z.string(),
  order: z.number().int(),
  sourcePath: z.string(),
  description: z.string().optional(),
  slug: z.string().optional(),
});

export type DocFrontmatter = z.output<typeof docFrontmatterSchema>;

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- ZodObject shape aliases preserve named property inference without a broad index signature.
type DocMetadataShape = {
  title: z.ZodString;
  section: z.ZodString;
  order: z.ZodNumber;
  description: z.ZodOptional<z.ZodString>;
  slug: z.ZodString;
};

export const docMetadataSchema: z.ZodObject<DocMetadataShape> = z.object({
  title: z.string(),
  section: z.string(),
  order: z.number().int(),
  description: z.string().optional(),
  slug: z.string(),
});

export type DocMetadata = z.output<typeof docMetadataSchema>;

const docEntityMetadataParserSchema: z.ZodObject<DocMetadataShape> = z.object({
  title: z.string(),
  section: z.string(),
  order: z.number().int(),
  description: z.string().optional(),
  slug: z.string(),
});

export const docSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"doc">;
    metadata: z.ZodObject<DocMetadataShape>;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("doc"),
  metadata: docEntityMetadataParserSchema,
});

export type Doc = z.output<typeof docSchema>;

export const docWithDataSchema: ReturnType<
  typeof docSchema.extend<{
    frontmatter: z.ZodObject<DocFrontmatterShape>;
    body: z.ZodString;
  }>
> = docSchema.extend({
  frontmatter: docFrontmatterSchema,
  body: z.string(),
});

export type DocWithData = z.output<typeof docWithDataSchema>;
