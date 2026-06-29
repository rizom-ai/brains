import { z } from "@brains/utils/zod";
import { z as z4 } from "@brains/utils/zod-v4";
import { baseEntityParserSchema } from "@brains/plugins";

/**
 * Topic metadata schema. Empty for now — unknown fields are stripped via
 * Zod's default behavior, which lets stored entities with legacy fields
 * (e.g. `aliases`, `sources`) round-trip without breaking.
 */
export const topicMetadataSchema = z.object({});

export type TopicMetadata = Record<string, unknown>;

const topicEntityMetadataParserSchema = z4
  .record(z4.string(), z4.unknown())
  .transform((): TopicMetadata => ({}));

/**
 * Topic entity schema - extends base entity with topic-specific fields
 */
export const topicEntitySchema = baseEntityParserSchema.extend({
  entityType: z4.literal("topic"),
  metadata: topicEntityMetadataParserSchema,
});

export type TopicEntity = z4.output<typeof topicEntitySchema>;

/**
 * Schema for topic body structure
 */
export const topicBodySchema = z4.object({
  content: z4.string(),
});

/**
 * Topic frontmatter schema - fields editable via CMS
 */
export const topicFrontmatterSchema = z.object({
  title: z.string().describe("Topic title"),
});

export type TopicBody = z4.output<typeof topicBodySchema>;
