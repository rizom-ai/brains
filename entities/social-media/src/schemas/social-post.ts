import { z } from "@brains/utils/zod";
import { baseEntityParserSchema } from "@brains/sdk/internal/entity-runtime";

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
    publishedAt: z
      .string()
      .datetime()
      .optional()
      .meta({ studioWidget: "provenance" }),
    platformPostId: z.string().optional().meta({
      description: "ID from platform after publishing",
      studioWidget: "provenance",
    }),
    sourceEntityId: z.string().optional().meta({
      description: "Source entity ID if auto-generated",
      studioWidget: "provenance",
    }),
    sourceEntityType: sourceEntityTypeSchema.optional().meta({
      description: "Source entity type (post, deck)",
      studioWidget: "provenance",
    }),
  });

export type SocialPostFrontmatter = z.output<
  typeof socialPostFrontmatterSchema
>;

/**
 * A social post's metadata: its frontmatter, the slug resolved from its
 * platform and title, and the error a failed publish
 * recorded, which the file never states. A slug a hand-written file states
 * is kept in the file and never read. None of the three is authored, so
 * Studio and the vault leave them out.
 */
type SocialPostMetadataSchema = ReturnType<
  typeof socialPostFrontmatterSchema.extend<{
    slug: z.ZodString;
    error: z.ZodOptional<z.ZodString>;
    statedSlug: z.ZodOptional<z.ZodString>;
  }>
>;

export const socialPostMetadataSchema: SocialPostMetadataSchema =
  socialPostFrontmatterSchema.extend({
    slug: z
      .string()
      .describe("URL-friendly identifier: {platform}-{title}")
      .meta({ studioWidget: "hidden" }),
    error: z.string().optional().meta({ studioWidget: "hidden" }),
    statedSlug: z.string().optional().meta({ studioWidget: "hidden" }),
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
