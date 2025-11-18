import { z } from "zod";
import { baseEntitySchema } from "@brains/entity-service";

/**
 * Blog post frontmatter schema (stored in content as YAML frontmatter)
 * Contains all blog post data for human editing
 */
export const blogPostFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string().optional(), // Auto-generated from title if not provided
  status: z.enum(["draft", "published"]),
  publishedAt: z.string().datetime().optional(),
  excerpt: z.string(),
  author: z.string(),
  coverImage: z.string().optional(),
  seriesName: z.string().optional(),
  seriesIndex: z.number().optional(),
  // SEO metadata (optional, with smart fallbacks)
  ogImage: z.string().url().optional(),
  ogDescription: z.string().optional(),
  twitterCard: z.enum(["summary", "summary_large_image"]).optional(),
  canonicalUrl: z.string().url().optional(),
});

export type BlogPostFrontmatter = z.infer<typeof blogPostFrontmatterSchema>;

/**
 * Blog post metadata schema (duplicates key searchable fields from frontmatter)
 * Following summary plugin pattern - used for fast filtering without parsing
 */
export const blogPostMetadataSchema = z.object({
  title: z.string(),
  slug: z.string(), // Required in metadata for fast slug-based queries
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
 * Blog post with parsed frontmatter data (returned by datasource)
 * Extends BlogPost with parsed frontmatter and body (markdown without frontmatter)
 */
export const blogPostWithDataSchema = blogPostSchema.extend({
  frontmatter: blogPostFrontmatterSchema,
  body: z.string(),
});

export type BlogPostWithData = z.infer<typeof blogPostWithDataSchema>;

/**
 * Enriched blog post schema (used for validation)
 * url and typeLabel are optional to allow validation before enrichment
 */
export const enrichedBlogPostSchema = blogPostWithDataSchema.extend({
  url: z.string().optional(),
  typeLabel: z.string().optional(),
});

/**
 * Enriched blog post type (used by components)
 * url and typeLabel are required - always present after enrichment
 */
export type EnrichedBlogPost = Omit<
  z.infer<typeof enrichedBlogPostSchema>,
  "url" | "typeLabel"
> & {
  url: string;
  typeLabel: string;
};
