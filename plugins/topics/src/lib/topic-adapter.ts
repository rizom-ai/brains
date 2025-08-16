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

// Schema for topic body structure (without title, which is dynamic)
const topicBodySchema = z.object({
  summary: z.string(),
  content: z.string(),
  keywords: z.array(z.string()),
  sources: z.array(z.string()), // Just source IDs
});

type TopicBody = z.infer<typeof topicBodySchema>;

/**
 * Entity adapter for Topic entities
 */
export class TopicAdapter implements EntityAdapter<TopicEntity> {
  public readonly entityType = "topic";
  public readonly schema = topicEntitySchema;

  constructor() {}

  /**
   * Create a formatter with the given title
   */
  private createFormatter(
    title: string,
  ): StructuredContentFormatter<TopicBody> {
    return new StructuredContentFormatter(topicBodySchema, {
      title,
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
          key: "keywords",
          label: "Keywords",
          type: "array",
          itemType: "string",
        },
        {
          key: "sources",
          label: "Sources",
          type: "array",
          itemType: "string",
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
  public extractMetadata(_entity: TopicEntity): Record<string, unknown> {
    // Metadata is now empty - all data stored in content body
    return {};
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
  ): TopicBody & { formatted: string; title: string } {
    try {
      // Extract title from H1
      const titleMatch = body.match(/^#\s+(.+)$/m);
      const title = titleMatch?.[1]?.trim() ?? "Unknown Topic";

      // Create formatter with extracted title
      const formatter = this.createFormatter(title);
      const parsed = formatter.parse(body);

      return {
        ...parsed,
        formatted: body,
        title,
      };
    } catch {
      // If parsing fails, return empty structure
      return {
        summary: "",
        content: body,
        keywords: [],
        sources: [],
        formatted: body,
        title: "Unknown Topic",
      };
    }
  }

  /**
   * Create topic body from components
   */
  public createTopicBody(params: {
    title: string;
    summary: string;
    content: string;
    keywords: string[];
    sources: TopicSource[];
  }): string {
    const bodyData: TopicBody = {
      summary: params.summary,
      content: params.content,
      keywords: params.keywords,
      sources: params.sources,
    };

    // Create formatter with the actual topic title
    const formatter = this.createFormatter(params.title);
    return formatter.format(bodyData);
  }
}
