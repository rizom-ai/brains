import { z } from "@brains/utils/zod";
import { baseEntityParserSchema } from "@brains/plugins";

/**
 * Blog post status
 */
export const blogPostStatusSchema: z.ZodEnum<{
  generating: "generating";
  draft: "draft";
  queued: "queued";
  published: "published";
  failed: "failed";
}> = z.enum(["generating", "draft", "queued", "published", "failed"]);

export type BlogPostStatus = z.output<typeof blogPostStatusSchema>;

/**
 * Blog post frontmatter schema (stored in content as YAML frontmatter)
 * Contains all blog post data for human editing
 */
type TwitterCardSchema = z.ZodOptional<
  z.ZodEnum<{ summary: "summary"; summary_large_image: "summary_large_image" }>
>;

type BlogPostFrontmatterSchema = z.ZodObject<{
  title: z.ZodString;
  slug: z.ZodOptional<z.ZodString>;
  status: typeof blogPostStatusSchema;
  publishedAt: z.ZodOptional<z.ZodString>;
  excerpt: z.ZodString;
  author: z.ZodString;
  coverImageId: z.ZodOptional<z.ZodString>;
  ogImageId: z.ZodOptional<z.ZodString>;
  seriesName: z.ZodOptional<z.ZodString>;
  seriesIndex: z.ZodOptional<z.ZodNumber>;
  ogImage: z.ZodOptional<z.ZodString>;
  ogDescription: z.ZodOptional<z.ZodString>;
  twitterCard: TwitterCardSchema;
  canonicalUrl: z.ZodOptional<z.ZodString>;
  atprotoUri: z.ZodOptional<z.ZodString>;
}>;

export const blogPostFrontmatterSchema: BlogPostFrontmatterSchema = z.object({
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
type BlogPostMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  status: typeof blogPostStatusSchema;
  publishedAt: z.ZodOptional<z.ZodString>;
  seriesName: z.ZodOptional<z.ZodString>;
  seriesIndex: z.ZodOptional<z.ZodNumber>;
  slug: z.ZodString;
  error: z.ZodOptional<z.ZodString>;
}>;

export const blogPostMetadataSchema: BlogPostMetadataSchema =
  blogPostFrontmatterSchema
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

/**
 * Blog post entity schema (extends BaseEntity)
 * Content field contains markdown with frontmatter + blog post body
 * Metadata field duplicates key fields from frontmatter for fast queries
 */
export const blogPostSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"post">;
    metadata: BlogPostMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("post"),
  metadata: blogPostMetadataSchema,
});

/**
 * Blog post entity type
 */
export type BlogPost = z.output<typeof blogPostSchema>;

/**
 * Blog post with parsed frontmatter data (returned by datasource)
 * Extends BlogPost with parsed frontmatter and body (markdown without frontmatter)
 * coverImageUrl is resolved from coverImageId and contains the actual image data URL
 */
export const blogPostWithDataSchema: ReturnType<
  typeof blogPostSchema.extend<{
    frontmatter: BlogPostFrontmatterSchema;
    body: z.ZodString;
    coverImageUrl: z.ZodOptional<z.ZodString>;
  }>
> = blogPostSchema.extend({
  frontmatter: blogPostFrontmatterSchema,
  body: z.string(),
  coverImageUrl: z.string().optional(), // Resolved data URL from coverImageId
});

export type BlogPostWithData = z.output<typeof blogPostWithDataSchema>;

/**
 * Enriched blog post schema (used for validation)
 * url, typeLabel, listUrl, listLabel are optional to allow validation before enrichment
 * seriesUrl is optional and only present for posts that belong to a series
 */
export const enrichedBlogPostSchema: ReturnType<
  typeof blogPostWithDataSchema.extend<{
    url: z.ZodOptional<z.ZodString>;
    typeLabel: z.ZodOptional<z.ZodString>;
    listUrl: z.ZodOptional<z.ZodString>;
    listLabel: z.ZodOptional<z.ZodString>;
    seriesUrl: z.ZodOptional<z.ZodString>;
    coverImageUrl: z.ZodOptional<z.ZodString>;
    ogImageUrl: z.ZodOptional<z.ZodString>;
    coverImageWidth: z.ZodOptional<z.ZodNumber>;
    coverImageHeight: z.ZodOptional<z.ZodNumber>;
    coverImageSrcset: z.ZodOptional<z.ZodString>;
    coverImageSizes: z.ZodOptional<z.ZodString>;
  }>
> = blogPostWithDataSchema.extend({
  url: z.string().optional(),
  typeLabel: z.string().optional(),
  listUrl: z.string().optional(),
  listLabel: z.string().optional(),
  seriesUrl: z.string().optional(),
  coverImageUrl: z.string().optional(),
  ogImageUrl: z.string().optional(),
  coverImageWidth: z.number().optional(),
  coverImageHeight: z.number().optional(),
  coverImageSrcset: z.string().optional(),
  coverImageSizes: z.string().optional(),
});

/**
 * Template blog post schema (used for template validation)
 * All enrichment fields are required - always present after enrichment
 */
export const templateBlogPostSchema: ReturnType<
  typeof blogPostWithDataSchema.extend<{
    url: z.ZodString;
    typeLabel: z.ZodString;
    listUrl: z.ZodString;
    listLabel: z.ZodString;
    seriesUrl: z.ZodOptional<z.ZodString>;
    coverImageUrl: z.ZodOptional<z.ZodString>;
    ogImageUrl: z.ZodOptional<z.ZodString>;
    coverImageWidth: z.ZodOptional<z.ZodNumber>;
    coverImageHeight: z.ZodOptional<z.ZodNumber>;
    coverImageSrcset: z.ZodOptional<z.ZodString>;
    coverImageSizes: z.ZodOptional<z.ZodString>;
  }>
> = blogPostWithDataSchema.extend({
  url: z.string(),
  typeLabel: z.string(),
  listUrl: z.string(),
  listLabel: z.string(),
  seriesUrl: z.string().optional(), // URL to series detail page (if post is in a series)
  coverImageUrl: z.string().optional(),
  ogImageUrl: z.string().optional(),
  coverImageWidth: z.number().optional(),
  coverImageHeight: z.number().optional(),
  coverImageSrcset: z.string().optional(),
  coverImageSizes: z.string().optional(),
});

/**
 * Enriched blog post type (used by components)
 * All enrichment fields (url, typeLabel, listUrl, listLabel) are required
 */
export type EnrichedBlogPost = z.output<typeof templateBlogPostSchema>;
