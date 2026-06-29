import { z } from "@brains/utils/zod-v4";
import { z as z4 } from "@brains/utils/zod-v4";
import { baseEntityParserSchema } from "@brains/plugins";

/**
 * Supported social media platforms
 */
export const platformSchema = z.enum(["linkedin"]);
export type Platform = z.output<typeof platformSchema>;

const platformParserSchema = z4.enum(["linkedin"]);

/**
 * Social post status
 * - draft: Created but not ready for publishing
 * - queued: Ready to publish, waiting in queue
 * - published: Successfully posted to platform
 * - failed: Publish error after max retries
 */
export const socialPostStatusSchema = z.enum([
  "generating",
  "draft",
  "queued",
  "published",
  "failed",
]);
export type SocialPostStatus = z.output<typeof socialPostStatusSchema>;

const socialPostStatusParserSchema = z4.enum([
  "generating",
  "draft",
  "queued",
  "published",
  "failed",
]);

/**
 * Source entity types that can generate social posts
 */
export const sourceEntityTypeSchema = z.enum(["post", "deck"]);
export type SourceEntityType = z.output<typeof sourceEntityTypeSchema>;

const sourceEntityTypeParserSchema = z4.enum(["post", "deck"]);

/**
 * Publishable document attachments for social posts.
 * coverImageId remains the image/visual-preview field; documents[] is for
 * generated PDF carousel/document attachments.
 */
export const socialPostDocumentAttachmentSchema = z.object({
  id: z.string().min(1).describe("Document entity ID"),
});
export type SocialPostDocumentAttachment = z.output<
  typeof socialPostDocumentAttachmentSchema
>;

const socialPostDocumentAttachmentParserSchema = z4.object({
  id: z4.string().min(1),
});

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
  documents: z
    .array(socialPostDocumentAttachmentSchema)
    .optional()
    .describe("Document attachments for publishing"),
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

export type SocialPostFrontmatter = z.output<
  typeof socialPostFrontmatterSchema
>;

/**
 * Lenient frontmatter schema for direct creation. A user "save this post"
 * request may omit platform/status, so make them optional here and let the
 * adapter fall back (platform is a single-value enum; an unspecified post is a
 * draft). Storage and read paths keep the strict schema above, so derived
 * metadata types are unaffected.
 */
export const socialPostCreateFrontmatterSchema =
  socialPostFrontmatterSchema.extend({
    platform: platformSchema.optional(),
    status: socialPostStatusSchema.optional(),
  });

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
    error: z.string().optional(),
  });

export type SocialPostMetadata = z.output<typeof socialPostMetadataSchema>;

const socialPostEntityMetadataParserSchema = z4.object({
  title: z4.string(),
  platform: platformParserSchema,
  status: socialPostStatusParserSchema,
  publishedAt: z4.string().datetime().optional(),
  platformPostId: z4.string().optional(),
  slug: z4.string(),
  error: z4.string().optional(),
});

const socialPostFrontmatterParserSchema = z4.object({
  title: z4.string(),
  platform: platformParserSchema,
  status: socialPostStatusParserSchema,
  coverImageId: z4.string().optional(),
  documents: z4.array(socialPostDocumentAttachmentParserSchema).optional(),
  publishedAt: z4.string().datetime().optional(),
  platformPostId: z4.string().optional(),
  sourceEntityId: z4.string().optional(),
  sourceEntityType: sourceEntityTypeParserSchema.optional(),
});

/**
 * Social post entity schema (extends BaseEntity)
 * Content field contains markdown with frontmatter + post body
 * Metadata field duplicates key fields from frontmatter for fast queries
 */
export const socialPostSchema = baseEntityParserSchema.extend({
  entityType: z4.literal("social-post"),
  metadata: socialPostEntityMetadataParserSchema,
});

export type SocialPost = z4.output<typeof socialPostSchema>;

/**
 * Social post with parsed frontmatter data (returned by datasource)
 * Extends SocialPost with parsed frontmatter and body
 */
export const socialPostWithDataSchema = socialPostSchema.extend({
  frontmatter: socialPostFrontmatterParserSchema,
  body: z4.string(),
});

export type SocialPostWithData = z4.output<typeof socialPostWithDataSchema>;

/**
 * Enriched social post schema for templates (includes URL fields)
 * Fields are optional to allow validation before site-builder enrichment
 */
export const enrichedSocialPostSchema = socialPostWithDataSchema.extend({
  url: z4.string().optional(),
  listUrl: z4.string().optional(),
  listLabel: z4.string().optional(),
  typeLabel: z4.string().optional(),
  coverImageUrl: z4.string().optional(),
  coverImageWidth: z4.number().optional(),
  coverImageHeight: z4.number().optional(),
});

export type EnrichedSocialPost = z4.output<typeof enrichedSocialPostSchema>;
