import { z } from "@brains/utils/zod-v4";
import { z as z4 } from "@brains/utils/zod-v4";
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

const docEntityMetadataParserSchema = z4.object({
  title: z4.string(),
  section: z4.string(),
  order: z4.number().int(),
  description: z4.string().optional(),
  slug: z4.string(),
});

const docFrontmatterParserSchema = z4.object({
  title: z4.string(),
  section: z4.string(),
  order: z4.number().int(),
  sourcePath: z4.string(),
  description: z4.string().optional(),
  slug: z4.string().optional(),
});

export const docSchema = baseEntityParserSchema.extend({
  entityType: z4.literal("doc"),
  metadata: docEntityMetadataParserSchema,
});

export type Doc = z4.output<typeof docSchema>;

export const docWithDataSchema = docSchema.extend({
  frontmatter: docFrontmatterParserSchema,
  body: z4.string(),
});

export type DocWithData = z4.output<typeof docWithDataSchema>;
