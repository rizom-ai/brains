import { z } from "zod";
import { baseEntitySchema } from "@brains/entity-service";

/**
 * Blog post metadata schema (stored in frontmatter)
 */
export const blogPostMetadataSchema = z.object({
  title: z.string(), // AI-generated
  slug: z.string(), // Auto-generated from title
  status: z.enum(["draft", "published"]),
  publishedAt: z.string().datetime().optional(),
  excerpt: z.string(), // AI-generated from content
  author: z.string(), // From profile entity
  coverImage: z.string().optional(), // Image URL (HackMD CDN, external, etc.)
  seriesName: z.string().optional(), // Series name
  seriesIndex: z.number().optional(), // Position in series
});

/**
 * Blog post entity schema (extends BaseEntity)
 * Content field contains the AI-generated markdown blog post
 * Metadata field contains structured blog post metadata (frontmatter)
 */
export const blogPostSchema = baseEntitySchema.extend({
  entityType: z.literal("blog"),
  metadata: blogPostMetadataSchema,
});

/**
 * Blog post entity type
 */
export type BlogPost = z.infer<typeof blogPostSchema>;

/**
 * Blog post metadata type
 */
export type BlogPostMetadata = z.infer<typeof blogPostMetadataSchema>;
