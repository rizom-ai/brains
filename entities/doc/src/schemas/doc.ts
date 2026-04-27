import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";

export const docFrontmatterSchema = z.object({
  title: z.string(),
  section: z.string(),
  order: z.number().int(),
  sourcePath: z.string(),
  description: z.string().optional(),
  slug: z.string().optional(),
});

export type DocFrontmatter = z.infer<typeof docFrontmatterSchema>;

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

export type DocMetadata = z.infer<typeof docMetadataSchema>;

export const docSchema = baseEntitySchema.extend({
  entityType: z.literal("doc"),
  metadata: docMetadataSchema,
});

export type Doc = z.infer<typeof docSchema>;

export const docWithDataSchema = docSchema.extend({
  frontmatter: docFrontmatterSchema,
  body: z.string(),
});

export type DocWithData = z.infer<typeof docWithDataSchema>;
