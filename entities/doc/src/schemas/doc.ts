import { z } from "@brains/utils/zod-v4";
import { baseEntityParserSchema } from "@brains/plugins";

export const docFrontmatterSchema = z.object({
  title: z.string(),
  section: z.string(),
  order: z.number().int(),
  sourcePath: z.string(),
  description: z.string().optional(),
  slug: z.string().optional(),
});

export type DocFrontmatter = z.output<typeof docFrontmatterSchema>;

export const docMetadataSchema = docFrontmatterSchema
  .pick({
    title: true,
    section: true,
    order: true,
    description: true,
  })
  .extend({
    slug: z.string(),
  });

export type DocMetadata = z.output<typeof docMetadataSchema>;

const docEntityMetadataParserSchema = z.object({
  title: z.string(),
  section: z.string(),
  order: z.number().int(),
  description: z.string().optional(),
  slug: z.string(),
});

const docFrontmatterParserSchema = z.object({
  title: z.string(),
  section: z.string(),
  order: z.number().int(),
  sourcePath: z.string(),
  description: z.string().optional(),
  slug: z.string().optional(),
});

export const docSchema = baseEntityParserSchema.extend({
  entityType: z.literal("doc"),
  metadata: docEntityMetadataParserSchema,
});

export type Doc = z.output<typeof docSchema>;

export const docWithDataSchema = docSchema.extend({
  frontmatter: docFrontmatterParserSchema,
  body: z.string(),
});

export type DocWithData = z.output<typeof docWithDataSchema>;
