import { z } from "zod";
import { baseEntitySchema } from "@brains/entity-service";

/**
 * Blog post frontmatter schema (stored in content as YAML frontmatter)
 * Contains all blog post data for human editing
 */
export const blogPostFrontmatterSchema = z.object({
  title: z.string(),
  status: z.enum(["draft", "published"]),
  publishedAt: z.string().datetime().optional(),
  excerpt: z.string(),
  author: z.string(),
  coverImage: z.string().optional(),
  seriesName: z.string().optional(),
  seriesIndex: z.number().optional(),
});

export type BlogPostFrontmatter = z.infer<typeof blogPostFrontmatterSchema>;

/**
 * Blog post metadata schema (duplicates key searchable fields from frontmatter)
 * Following summary plugin pattern - used for fast filtering without parsing
 */
export const blogPostMetadataSchema = z.object({
  title: z.string(),
  status: z.enum(["draft", "published"]),
  publishedAt: z.string().datetime().optional(),
  seriesName: z.string().optional(),
  seriesIndex: z.number().optional(),
});

export type BlogPostMetadata = z.infer<typeof blogPostMetadataSchema>;

/**
 * Blog post entity schema (extends BaseEntity)
 * Content field contains markdown with frontmatter + blog post body
 * Metadata field duplicates key fields from frontmatter for fast queries
 */
export const blogPostSchema = baseEntitySchema.extend({
  entityType: z.literal("post"),
  metadata: blogPostMetadataSchema,
});

/**
 * Blog post entity type
 */
export type BlogPost = z.infer<typeof blogPostSchema>;

/**
 * Blog post with parsed frontmatter data (used by datasource)
 * Extends BlogPost with parsed frontmatter and body (markdown without frontmatter) for templates
 */
export const blogPostWithDataSchema = blogPostSchema.extend({
  frontmatter: blogPostFrontmatterSchema,
  body: z.string(),
});
