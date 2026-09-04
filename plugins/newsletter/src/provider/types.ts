import { baseEntitySchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

/**
 * Blog post entity shape (minimal fields needed for newsletter handlers).
 * A structural schema: newsletter reads foreign "post" entities and proves
 * just the fields it needs.
 */
type BlogPostSourceMetadataSchema = ReturnType<
  typeof z.looseObject<{
    title: z.ZodString;
    slug: z.ZodString;
    status: z.ZodString;
    excerpt: z.ZodOptional<z.ZodString>;
  }>
>;

const blogPostSourceMetadataSchema: BlogPostSourceMetadataSchema =
  z.looseObject({
    title: z.string(),
    slug: z.string(),
    status: z.string(),
    excerpt: z.string().optional(),
  });

export const blogPostSourceSchema: ReturnType<
  typeof baseEntitySchema.extend<{
    metadata: BlogPostSourceMetadataSchema;
  }>
> = baseEntitySchema.extend({
  metadata: blogPostSourceMetadataSchema,
});
export type BlogPost = z.output<typeof blogPostSourceSchema>;
