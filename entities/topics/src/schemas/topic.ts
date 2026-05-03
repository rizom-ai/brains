import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";

/**
 * Topic metadata schema.
 * Aliases are system-maintained canonicalization state used for
 * search and merge reuse. Old entities may have `sources` in metadata;
 * the schema accepts and strips unknown fields via Zod's default behavior.
 */
export const topicMetadataSchema = z.object({
  aliases: z.array(z.string()).optional(),
});

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
