import { z } from "@brains/utils/zod";
import { baseEntityParserSchema } from "@brains/plugins";

/**
 * Topic metadata schema. Empty for now — unknown fields are stripped via
 * Zod's default behavior, which lets stored entities with legacy fields
 * (e.g. `aliases`, `sources`) round-trip without breaking.
 */
export const topicMetadataSchema: z.ZodObject<Record<string, never>> = z.object(
  {},
);

export type TopicMetadata = Record<string, unknown>;

const topicEntityMetadataParserSchema: z.ZodType<TopicMetadata, unknown> = z
  .record(z.string(), z.unknown())
  .transform((): TopicMetadata => ({}));

export interface TopicEntity extends z.output<typeof baseEntityParserSchema> {
  entityType: "topic";
  metadata: TopicMetadata;
}

/**
 * Topic entity schema - extends base entity with topic-specific fields
 */
export const topicEntitySchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"topic">;
    metadata: z.ZodType<TopicMetadata, unknown>;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("topic"),
  metadata: topicEntityMetadataParserSchema,
});

export interface TopicBody {
  content: string;
}

/**
 * Schema for topic body structure
 */
export const topicBodySchema: z.ZodType<TopicBody, TopicBody> = z.object({
  content: z.string(),
});

export interface TopicFrontmatter {
  [key: string]: unknown;
  title: string;
}

type TopicFrontmatterSchema = z.ZodObject<{
  title: z.ZodString;
}>;

/**
 * Topic frontmatter schema - fields editable via CMS
 */
export const topicFrontmatterSchema: TopicFrontmatterSchema = z.object({
  title: z.string().describe("Topic title"),
});
