import { z } from "zod";
import { baseEntitySchema } from "@brains/plugins";

/**
 * Blog post status
 */
export const blogPostStatusSchema = z.enum(["draft", "queued", "published"]);
export type BlogPostStatus = z.infer<typeof blogPostStatusSchema>;

/**
 * Blog post frontmatter schema (stored in content as YAML frontmatter)
 * Contains all blog post data for human editing
 */
export const blogPostFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string().optional(), // Auto-generated from title if not provided
  status: blogPostStatusSchema,
  publishedAt: z.string().datetime().optional(),
  excerpt: z.string(),
  author: z.string(),
  coverImageId: z.string().optional(), // References an image entity by ID
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
 * Blog post metadata schema - derived from frontmatter
 * Only includes fields needed for fast DB queries/filtering
 * Using .pick() ensures metadata stays in sync with frontmatter
 */
export const blogPostMetadataSchema = blogPostFrontmatterSchema
  .pick({
    title: true,
    status: true,
    publishedAt: true,
    seriesName: true,
    seriesIndex: true,
  })
  .extend({
    // slug is required in metadata (auto-generated from title if not in frontmatter)
    slug: z.string(),
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
 * coverImageUrl is resolved from coverImageId and contains the actual image data URL
 */
export const blogPostWithDataSchema = blogPostSchema.extend({
  frontmatter: blogPostFrontmatterSchema,
  body: z.string(),
  coverImageUrl: z.string().optional(), // Resolved data URL from coverImageId
});

export type BlogPostWithData = z.infer<typeof blogPostWithDataSchema>;

/**
 * Enriched blog post schema (used for validation)
 * url, typeLabel, listUrl, listLabel are optional to allow validation before enrichment
 * seriesUrl is optional and only present for posts that belong to a series
 */
export const enrichedBlogPostSchema = blogPostWithDataSchema.extend({
  url: z.string().optional(),
  typeLabel: z.string().optional(),
  listUrl: z.string().optional(),
  listLabel: z.string().optional(),
  seriesUrl: z.string().optional(),
  coverImageUrl: z.string().optional(),
  coverImageWidth: z.number().optional(),
  coverImageHeight: z.number().optional(),
});

/**
 * Template blog post schema (used for template validation)
 * All enrichment fields are required - always present after enrichment
 */
export const templateBlogPostSchema = blogPostWithDataSchema.extend({
  url: z.string(),
  typeLabel: z.string(),
  listUrl: z.string(),
  listLabel: z.string(),
  seriesUrl: z.string().optional(), // URL to series detail page (if post is in a series)
  coverImageUrl: z.string().optional(),
  coverImageWidth: z.number().optional(),
  coverImageHeight: z.number().optional(),
});

/**
 * Enriched blog post type (used by components)
 * All enrichment fields (url, typeLabel, listUrl, listLabel) are required
 */
export type EnrichedBlogPost = z.infer<typeof templateBlogPostSchema>;
