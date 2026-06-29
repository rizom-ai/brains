import { z } from "@brains/utils/zod-v4";
import { z as z4 } from "@brains/utils/zod-v4";
import { baseEntityParserSchema } from "@brains/plugins";

/**
 * Blog post status
 */
export const blogPostStatusSchema = z.enum([
  "generating",
  "draft",
  "queued",
  "published",
  "failed",
]);
export type BlogPostStatus = z.output<typeof blogPostStatusSchema>;

const blogPostStatusParserSchema = z4.enum([
  "generating",
  "draft",
  "queued",
  "published",
  "failed",
]);

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
  ogImageId: z.string().optional(), // References an image entity for social/OG metadata
  seriesName: z.string().optional(),
  seriesIndex: z.number().optional(),
  // SEO metadata (optional, with smart fallbacks)
  ogImage: z.string().url().optional(),
  ogDescription: z.string().optional(),
  twitterCard: z.enum(["summary", "summary_large_image"]).optional(),
  canonicalUrl: z.string().url().optional(),
  atprotoUri: z.string().optional(),
});

export type BlogPostFrontmatter = z.output<typeof blogPostFrontmatterSchema>;

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
    error: z.string().optional(),
  });

export type BlogPostMetadata = z.output<typeof blogPostMetadataSchema>;

const blogPostEntityMetadataParserSchema = z4.object({
  title: z4.string(),
  status: blogPostStatusParserSchema,
  publishedAt: z4.string().datetime().optional(),
  seriesName: z4.string().optional(),
  seriesIndex: z4.number().optional(),
  slug: z4.string(),
  error: z4.string().optional(),
});

const blogPostFrontmatterParserSchema = z4.object({
  title: z4.string(),
  slug: z4.string().optional(),
  status: blogPostStatusParserSchema,
  publishedAt: z4.string().datetime().optional(),
  excerpt: z4.string(),
  author: z4.string(),
  coverImageId: z4.string().optional(),
  ogImageId: z4.string().optional(),
  seriesName: z4.string().optional(),
  seriesIndex: z4.number().optional(),
  ogImage: z4.url().optional(),
  ogDescription: z4.string().optional(),
  twitterCard: z4.enum(["summary", "summary_large_image"]).optional(),
  canonicalUrl: z4.url().optional(),
  atprotoUri: z4.string().optional(),
});

/**
 * Blog post entity schema (extends BaseEntity)
 * Content field contains markdown with frontmatter + blog post body
 * Metadata field duplicates key fields from frontmatter for fast queries
 */
export const blogPostSchema = baseEntityParserSchema.extend({
  entityType: z4.literal("post"),
  metadata: blogPostEntityMetadataParserSchema,
});

/**
 * Blog post entity type
 */
export type BlogPost = z4.output<typeof blogPostSchema>;

/**
 * Blog post with parsed frontmatter data (returned by datasource)
 * Extends BlogPost with parsed frontmatter and body (markdown without frontmatter)
 * coverImageUrl is resolved from coverImageId and contains the actual image data URL
 */
export const blogPostWithDataSchema = blogPostSchema.extend({
  frontmatter: blogPostFrontmatterParserSchema,
  body: z4.string(),
  coverImageUrl: z4.string().optional(), // Resolved data URL from coverImageId
});

export type BlogPostWithData = z4.output<typeof blogPostWithDataSchema>;

/**
 * Enriched blog post schema (used for validation)
 * url, typeLabel, listUrl, listLabel are optional to allow validation before enrichment
 * seriesUrl is optional and only present for posts that belong to a series
 */
export const enrichedBlogPostSchema = blogPostWithDataSchema.extend({
  url: z4.string().optional(),
  typeLabel: z4.string().optional(),
  listUrl: z4.string().optional(),
  listLabel: z4.string().optional(),
  seriesUrl: z4.string().optional(),
  coverImageUrl: z4.string().optional(),
  ogImageUrl: z4.string().optional(),
  coverImageWidth: z4.number().optional(),
  coverImageHeight: z4.number().optional(),
  coverImageSrcset: z4.string().optional(),
  coverImageSizes: z4.string().optional(),
});

/**
 * Template blog post schema (used for template validation)
 * All enrichment fields are required - always present after enrichment
 */
export const templateBlogPostSchema = blogPostWithDataSchema.extend({
  url: z4.string(),
  typeLabel: z4.string(),
  listUrl: z4.string(),
  listLabel: z4.string(),
  seriesUrl: z4.string().optional(), // URL to series detail page (if post is in a series)
  coverImageUrl: z4.string().optional(),
  ogImageUrl: z4.string().optional(),
  coverImageWidth: z4.number().optional(),
  coverImageHeight: z4.number().optional(),
  coverImageSrcset: z4.string().optional(),
  coverImageSizes: z4.string().optional(),
});

/**
 * Enriched blog post type (used by components)
 * All enrichment fields (url, typeLabel, listUrl, listLabel) are required
 */
export type EnrichedBlogPost = z4.output<typeof templateBlogPostSchema>;
