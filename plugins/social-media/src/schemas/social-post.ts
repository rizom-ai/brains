import { z } from "zod";
import { baseEntitySchema } from "@brains/plugins";

/**
 * Supported social media platforms
 */
export const platformSchema = z.enum(["linkedin"]);
export type Platform = z.infer<typeof platformSchema>;

/**
 * Social post status
 * - draft: Created but not ready for publishing
 * - queued: Ready to publish, waiting in queue
 * - published: Successfully posted to platform
 * - failed: Publish error after max retries
 */
export const socialPostStatusSchema = z.enum([
  "draft",
  "queued",
  "published",
  "failed",
]);
export type SocialPostStatus = z.infer<typeof socialPostStatusSchema>;

/**
 * Source entity types that can generate social posts
 */
export const sourceEntityTypeSchema = z.enum(["post", "deck"]);
export type SourceEntityType = z.infer<typeof sourceEntityTypeSchema>;

/**
 * Social post frontmatter schema (stored in content as YAML frontmatter)
 * Post text goes in markdown body, metadata in frontmatter
 */
export const socialPostFrontmatterSchema = z.object({
  title: z
    .string()
    .describe("Short descriptive title (3-6 words) for file naming"),
  platform: platformSchema.describe("Target platform"),
  status: socialPostStatusSchema,
  coverImageId: z
    .string()
    .optional()
    .describe("Image entity ID for post image"),
  publishedAt: z.string().datetime().optional(),
  platformPostId: z
    .string()
    .optional()
    .describe("ID from platform after publishing"),
  sourceEntityId: z
    .string()
    .optional()
    .describe("Source entity ID if auto-generated"),
  sourceEntityType: sourceEntityTypeSchema
    .optional()
    .describe("Source entity type (post, deck)"),
});

export type SocialPostFrontmatter = z.infer<typeof socialPostFrontmatterSchema>;

/**
 * Social post metadata schema - derived from frontmatter
 * Only includes fields needed for fast DB queries/filtering
 * Using .pick() ensures metadata stays in sync with frontmatter
 */
export const socialPostMetadataSchema = socialPostFrontmatterSchema
  .pick({
    title: true,
    platform: true,
    status: true,
    publishedAt: true,
    platformPostId: true,
  })
  .extend({
    slug: z.string().describe("URL-friendly identifier: {platform}-{title}"),
  });

export type SocialPostMetadata = z.infer<typeof socialPostMetadataSchema>;

/**
 * Social post entity schema (extends BaseEntity)
 * Content field contains markdown with frontmatter + post body
 * Metadata field duplicates key fields from frontmatter for fast queries
 */
export const socialPostSchema = baseEntitySchema.extend({
  entityType: z.literal("social-post"),
  metadata: socialPostMetadataSchema,
});

export type SocialPost = z.infer<typeof socialPostSchema>;

/**
 * Social post with parsed frontmatter data (returned by datasource)
 * Extends SocialPost with parsed frontmatter and body
 */
export const socialPostWithDataSchema = socialPostSchema.extend({
  frontmatter: socialPostFrontmatterSchema,
  body: z.string(),
});

export type SocialPostWithData = z.infer<typeof socialPostWithDataSchema>;

/**
 * Enriched social post schema for templates (includes URL fields)
 * Fields are optional to allow validation before site-builder enrichment
 */
export const enrichedSocialPostSchema = socialPostWithDataSchema.extend({
  url: z.string().optional(),
  listUrl: z.string().optional(),
  listLabel: z.string().optional(),
  typeLabel: z.string().optional(),
  coverImageUrl: z.string().optional(),
});

export type EnrichedSocialPost = z.infer<typeof enrichedSocialPostSchema>;
