import type { EntityAdapter } from "@brains/plugins";
import {
  parseMarkdownWithFrontmatter,
  StructuredContentFormatter,
} from "@brains/plugins";
import type { z } from "@brains/utils";
import { SourceListFormatter } from "@brains/utils";
import {
  topicEntitySchema,
  topicBodySchema,
  topicSourceSchema,
  type TopicEntity,
  type TopicBody,
  type TopicSource,
  type TopicMetadata,
} from "../schemas/topic";

/**
 * Entity adapter for Topic entities
 */
export class TopicAdapter implements EntityAdapter<TopicEntity, TopicMetadata> {
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
          type: "custom",
          formatter: (value: unknown): string => {
            const sources = topicSourceSchema.array().parse(value);
            return SourceListFormatter.format(sources);
          },
          parser: (text: string): unknown => SourceListFormatter.parse(text),
        },
      ],
    });
  }

  /**
   * Convert topic entity to markdown
   * Topics don't use frontmatter - return content as-is
   */
  public toMarkdown(entity: TopicEntity): string {
    return entity.content;
  }

  /**
   * Extract topic-specific fields from markdown
   * Parses sources from the body to restore metadata for batch-extract tracking
   */
  public fromMarkdown(markdown: string): Partial<TopicEntity> {
    // Parse sources from body content using SourceListFormatter
    const sourcesSection = SourceListFormatter.extractSection(markdown);
    const sources = sourcesSection
      ? SourceListFormatter.parse(sourcesSection)
      : [];

    return {
      content: markdown, // Keep full markdown including frontmatter
      entityType: "topic",
      metadata: {
        sources: sources.length > 0 ? sources : undefined,
      },
    };
  }

  /**
   * Extract metadata for search/filtering
   * Topics don't use metadata for filtering
   */
  public extractMetadata(_entity: TopicEntity): TopicMetadata {
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
  public generateFrontMatter(_entity: TopicEntity): string {
    return "";
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
    content: string;
    keywords: string[];
    sources: TopicSource[];
  }): string {
    const bodyData: TopicBody = {
      content: params.content,
      keywords: params.keywords,
      sources: params.sources,
    };

    // Create formatter with the actual topic title
    const formatter = this.createFormatter(params.title);
    return formatter.format(bodyData);
  }
}
