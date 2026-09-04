import { z } from "@brains/utils/zod";
import { baseEntityParserSchema } from "@brains/plugins";

/**
 * Supported social media platforms
 */
export const platformSchema: z.ZodEnum<{ linkedin: "linkedin" }> = z.enum([
  "linkedin",
]);

export type Platform = z.output<typeof platformSchema>;

/**
 * Social post status
 * - draft: Created but not ready for publishing
 * - queued: Ready to publish, waiting in queue
 * - published: Successfully posted to platform
 * - failed: Publish error after max retries
 */
export const socialPostStatusSchema: z.ZodEnum<{
  generating: "generating";
  draft: "draft";
  queued: "queued";
  published: "published";
  failed: "failed";
}> = z.enum(["generating", "draft", "queued", "published", "failed"]);

export type SocialPostStatus = z.output<typeof socialPostStatusSchema>;

/**
 * Source entity types that can generate social posts
 */
export const sourceEntityTypeSchema: z.ZodEnum<{ post: "post"; deck: "deck" }> =
  z.enum(["post", "deck"]);

export type SourceEntityType = z.output<typeof sourceEntityTypeSchema>;

/**
 * Publishable document attachments for social posts.
 * coverImageId remains the image/visual-preview field; documents[] is for
 * generated PDF carousel/document attachments.
 */
type SocialPostDocumentAttachmentSchema = z.ZodObject<{
  id: z.ZodString;
}>;

export const socialPostDocumentAttachmentSchema: SocialPostDocumentAttachmentSchema =
  z.object({
    id: z.string().min(1).describe("Document entity ID"),
  });

export type SocialPostDocumentAttachment = z.output<
  typeof socialPostDocumentAttachmentSchema
>;

/**
 * Social post frontmatter schema (stored in content as YAML frontmatter)
 * Post text goes in markdown body, metadata in frontmatter
 */
type SocialPostFrontmatterSchema = z.ZodObject<{
  title: z.ZodString;
  platform: typeof platformSchema;
  status: typeof socialPostStatusSchema;
  coverImageId: z.ZodOptional<z.ZodString>;
  documents: z.ZodOptional<z.ZodArray<SocialPostDocumentAttachmentSchema>>;
  publishedAt: z.ZodOptional<z.ZodString>;
  platformPostId: z.ZodOptional<z.ZodString>;
  sourceEntityId: z.ZodOptional<z.ZodString>;
  sourceEntityType: z.ZodOptional<typeof sourceEntityTypeSchema>;
}>;

export const socialPostFrontmatterSchema: SocialPostFrontmatterSchema =
  z.object({
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
export const socialPostCreateFrontmatterSchema: ReturnType<
  typeof socialPostFrontmatterSchema.extend<{
    platform: z.ZodOptional<typeof platformSchema>;
    status: z.ZodOptional<typeof socialPostStatusSchema>;
  }>
> = socialPostFrontmatterSchema.extend({
  platform: platformSchema.optional(),
  status: socialPostStatusSchema.optional(),
});

/**
 * Social post metadata schema - derived from frontmatter
 * Only includes fields needed for fast DB queries/filtering
 * Using .pick() ensures metadata stays in sync with frontmatter
 */
type SocialPostMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  platform: typeof platformSchema;
  status: typeof socialPostStatusSchema;
  publishedAt: z.ZodOptional<z.ZodString>;
  platformPostId: z.ZodOptional<z.ZodString>;
  slug: z.ZodString;
  error: z.ZodOptional<z.ZodString>;
}>;

export const socialPostMetadataSchema: SocialPostMetadataSchema =
  socialPostFrontmatterSchema
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

/**
 * Social post entity schema (extends BaseEntity)
 * Content field contains markdown with frontmatter + post body
 * Metadata field duplicates key fields from frontmatter for fast queries
 */
export const socialPostSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"social-post">;
    metadata: SocialPostMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("social-post"),
  metadata: socialPostMetadataSchema,
});

export type SocialPost = z.output<typeof socialPostSchema>;

/**
 * Social post with parsed frontmatter data (returned by datasource)
 * Extends SocialPost with parsed frontmatter and body
 */
export const socialPostWithDataSchema: ReturnType<
  typeof socialPostSchema.extend<{
    frontmatter: SocialPostFrontmatterSchema;
    body: z.ZodString;
  }>
> = socialPostSchema.extend({
  frontmatter: socialPostFrontmatterSchema,
  body: z.string(),
});

export type SocialPostWithData = z.output<typeof socialPostWithDataSchema>;

/**
 * Enriched social post schema for templates (includes URL fields)
 * Fields are optional to allow validation before site-builder enrichment
 */
export const enrichedSocialPostSchema: ReturnType<
  typeof socialPostWithDataSchema.extend<{
    url: z.ZodOptional<z.ZodString>;
    listUrl: z.ZodOptional<z.ZodString>;
    listLabel: z.ZodOptional<z.ZodString>;
    typeLabel: z.ZodOptional<z.ZodString>;
    coverImageUrl: z.ZodOptional<z.ZodString>;
    coverImageWidth: z.ZodOptional<z.ZodNumber>;
    coverImageHeight: z.ZodOptional<z.ZodNumber>;
  }>
> = socialPostWithDataSchema.extend({
  url: z.string().optional(),
  listUrl: z.string().optional(),
  listLabel: z.string().optional(),
  typeLabel: z.string().optional(),
  coverImageUrl: z.string().optional(),
  coverImageWidth: z.number().optional(),
  coverImageHeight: z.number().optional(),
});

export type EnrichedSocialPost = z.output<typeof enrichedSocialPostSchema>;
