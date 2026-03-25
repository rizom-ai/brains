import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";

/**
 * Topic metadata schema
 * Sources are stored in metadata for efficient querying (contentHash lookups)
 * The markdown body also contains human-readable source info
 */
export const topicMetadataSchema = z.object({
  sources: z
    .array(
      z.object({
        slug: z.string(),
        title: z.string(),
        type: z.string(),
        entityId: z.string(),
        contentHash: z.string(),
      }),
    )
    .optional(),
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
 * Schema for topic source with metadata
 * type can be any entity type (post, link, summary, etc.)
 */
export const topicSourceSchema = z.object({
  slug: z.string(),
  title: z.string(),
  type: z.string(),
  entityId: z.string(), // Back-reference to source entity
  contentHash: z.string(), // Track which version was extracted
});

export type TopicSource = z.infer<typeof topicSourceSchema>;

/**
 * Schema for topic body structure (without title, which is dynamic)
 */
export const topicBodySchema = z.object({
  content: z.string(),
  keywords: z.array(z.string()),
  sources: z.array(topicSourceSchema), // Rich source objects with metadata
});

/**
 * Topic frontmatter schema - fields editable via CMS
 * Sources are excluded because they are auto-generated
 */
export const topicFrontmatterSchema = z.object({
  title: z.string().describe("Topic title"),
  keywords: z.array(z.string()).optional().describe("Topic keywords"),
});

export type TopicBody = z.infer<typeof topicBodySchema>;

/**
 * Topic extraction job data schema
 */
export const topicExtractionJobDataSchema = z.object({
  timeWindowHours: z.number().min(1),
  minRelevanceScore: z.number().min(0).max(1),
});

export type TopicExtractionJobData = z.infer<
  typeof topicExtractionJobDataSchema
>;

/**
 * Topic merge job data schema
 */
export const topicMergeJobDataSchema = z.object({
  topicIds: z.array(z.string()).min(2),
  similarityThreshold: z.number().min(0).max(1),
});

export type TopicMergeJobData = z.infer<typeof topicMergeJobDataSchema>;
