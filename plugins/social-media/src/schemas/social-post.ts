import { z } from "zod";
import { baseEntitySchema } from "@brains/entity-service";

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
  platform: platformSchema.describe("Target platform"),
  status: socialPostStatusSchema,
  queueOrder: z
    .number()
    .optional()
    .describe("Position in publish queue (lower = sooner)"),
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
  retryCount: z.number().default(0).describe("Number of publish attempts"),
  lastError: z.string().optional().describe("Last publish error if failed"),
});

export type SocialPostFrontmatter = z.infer<typeof socialPostFrontmatterSchema>;

/**
 * Social post metadata schema (duplicates key searchable fields from frontmatter)
 * Used for fast filtering without parsing markdown content
 */
export const socialPostMetadataSchema = z.object({
  slug: z.string().describe("URL-friendly identifier"),
  platform: platformSchema,
  status: socialPostStatusSchema,
  queueOrder: z.number().optional(),
  publishedAt: z.string().datetime().optional(),
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
