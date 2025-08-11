import type { EntityAdapter } from "@brains/plugins";
import {
  baseEntitySchema,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import { StructuredContentFormatter } from "@brains/plugins";
import { topicMetadataSchema, type TopicSource } from "../schemas/topic";
import { z } from "zod";

// Extend base entity schema for topics
export const topicEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("topic"),
  metadata: topicMetadataSchema,
});

export type TopicEntity = z.infer<typeof topicEntitySchema>;

// Schema for topic body structure
const topicBodySchema = z.object({
  summary: z.string(),
  content: z.string(),
  references: z.array(
    z.object({
      type: z.string(),
      id: z.string(),
      timestamp: z.string(),
      context: z.string().optional(),
    }),
  ),
});

type TopicBody = z.infer<typeof topicBodySchema>;

/**
 * Entity adapter for Topic entities
 */
export class TopicAdapter implements EntityAdapter<TopicEntity> {
  public readonly entityType = "topic";
  public readonly schema = topicEntitySchema;
  private formatter: StructuredContentFormatter<TopicBody>;

  constructor() {
    // Configure structured content formatter for topic body
    this.formatter = new StructuredContentFormatter(topicBodySchema, {
      title: "Topic Content",
      mappings: [
        {
          key: "summary",
          label: "Summary",
          type: "string",
        },
        {
          key: "content",
          label: "Content",
          type: "string",
        },
        {
          key: "references",
          label: "References",
          type: "array",
          itemType: "object",
          itemMappings: [
            {
              key: "type",
              label: "Type",
              type: "string",
            },
            {
              key: "id",
              label: "ID",
              type: "string",
            },
            {
              key: "timestamp",
              label: "Timestamp",
              type: "string",
            },
            {
              key: "context",
              label: "Context",
              type: "string",
            },
          ],
        },
      ],
    });
  }

  /**
   * Convert topic entity to markdown
   * Topics don't need frontmatter as the ID is the title
   */
  public toMarkdown(entity: TopicEntity): string {
    // Just return the content as-is
    return entity.content;
  }

  /**
   * Extract topic-specific fields from markdown
   */
  public fromMarkdown(markdown: string): Partial<TopicEntity> {
    // Topics store everything in the content, no frontmatter needed
    return {
      content: markdown,
      entityType: "topic",
    };
  }

  /**
   * Extract metadata for search/filtering
   */
  public extractMetadata(entity: TopicEntity): Record<string, unknown> {
    return {
      keywords: entity.metadata.keywords,
      relevanceScore: entity.metadata.relevanceScore,
      mentionCount: entity.metadata.mentionCount,
    };
  }

  /**
   * Parse frontmatter from markdown
   */
  public parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    const { metadata } = parseMarkdownWithFrontmatter(markdown, schema);
    return metadata;
  }

  /**
   * Generate frontmatter for the entity
   * Topics don't use frontmatter
   */
  public generateFrontMatter(entity: TopicEntity): string {
    return entity.content;
  }

  /**
   * Parse topic body to extract structured content
   */
  public parseTopicBody(
    body: string,
  ): TopicBody & { sources: TopicSource[]; formatted: string } {
    try {
      const parsed = this.formatter.parse(body);

      // Convert references back to TopicSource format
      const sources: TopicSource[] = parsed.references.map((ref) => ({
        type: ref.type as TopicSource["type"],
        id: ref.id,
        timestamp: new Date(ref.timestamp),
        context: ref.context,
      }));

      return {
        ...parsed,
        sources,
        formatted: body,
      };
    } catch {
      // If parsing fails, return empty structure
      return {
        summary: "",
        content: body,
        references: [],
        sources: [],
        formatted: body,
      };
    }
  }

  /**
   * Create topic body from components
   */
  public createTopicBody(params: {
    summary: string;
    content: string;
    references: TopicSource[];
  }): string {
    const bodyData: TopicBody = {
      summary: params.summary,
      content: params.content,
      references: params.references.map((ref) => ({
        type: ref.type,
        id: ref.id,
        timestamp: ref.timestamp.toISOString(),
        context: ref.context,
      })),
    };

    return this.formatter.format(bodyData);
  }
}
