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

const topicEntityMetadataParserSchema: z.ZodPipe<
  z.ZodRecord<z.ZodString, z.ZodUnknown>,
  z.ZodTransform<TopicMetadata, Record<string, unknown>>
> = z.record(z.string(), z.unknown()).transform((): TopicMetadata => ({}));

/**
 * Topic entity schema - extends base entity with topic-specific fields
 */
export const topicEntitySchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"topic">;
    metadata: typeof topicEntityMetadataParserSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("topic"),
  metadata: topicEntityMetadataParserSchema,
});

export type TopicEntity = z.output<typeof topicEntitySchema>;

/**
 * Schema for topic body structure
 */
export const topicBodySchema: z.ZodObject<{ content: z.ZodString }> = z.object({
  content: z.string(),
});

export type TopicBody = z.output<typeof topicBodySchema>;

/**
 * Topic frontmatter schema - fields editable via Studio
 */
export const topicFrontmatterSchema: z.ZodObject<{ title: z.ZodString }> =
  z.object({
    title: z.string().describe("Topic title"),
  });

export type TopicFrontmatter = z.output<typeof topicFrontmatterSchema>;
