import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";

/**
 * Topic metadata schema. Empty for now — unknown fields are stripped via
 * Zod's default behavior, which lets stored entities with legacy fields
 * (e.g. `aliases`, `sources`) round-trip without breaking.
 */
export const topicMetadataSchema = z.object({});

export type TopicMetadata = z.infer<typeof topicMetadataSchema>;

/**
 * Topic entity schema - extends base entity with topic-specific fields
 */
export const topicEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("topic"),
  metadata: topicMetadataSchema,
});

export type TopicEntity = z.infer<typeof topicEntitySchema>;

/**
 * Schema for topic body structure
 */
export const topicBodySchema = z.object({
  content: z.string(),
});

/**
 * Topic frontmatter schema - fields editable via CMS
 */
export const topicFrontmatterSchema = z.object({
  title: z.string().describe("Topic title"),
});

export type TopicBody = z.infer<typeof topicBodySchema>;
