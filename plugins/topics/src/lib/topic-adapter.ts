import type { EntityAdapter } from "@brains/plugins";
import {
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
  generateFrontmatter,
  StructuredContentFormatter,
} from "@brains/plugins";
import { z, SourceListFormatter } from "@brains/utils";
import {
  topicEntitySchema,
  topicBodySchema,
  topicSourceSchema,
  type TopicEntity,
  type TopicBody,
  type TopicSource,
} from "../schemas/topic";

// Schema for parsing frontmatter metadata
const topicFrontmatterSchema = z.object({
  keywords: z.array(z.string()).optional(),
  sourceCount: z.number().optional(),
});

// Type for topic metadata
type TopicMetadata = z.infer<typeof topicFrontmatterSchema>;

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
   * Convert topic entity to markdown with frontmatter if metadata exists
   */
  public toMarkdown(entity: TopicEntity): string {
    // Extract the body content without any existing frontmatter
    let contentBody = entity.content;
    try {
      const parsed = parseMarkdownWithFrontmatter(entity.content, z.object({}));
      contentBody = parsed.content;
    } catch {
      // Content doesn't have frontmatter, use as-is
    }

    // Always include metadata as frontmatter if it exists
    if (entity.metadata && Object.keys(entity.metadata).length > 0) {
      return generateMarkdownWithFrontmatter(contentBody, entity.metadata);
    }

    return contentBody;
  }

  /**
   * Extract topic-specific fields from markdown, including frontmatter
   */
  public fromMarkdown(markdown: string): Partial<TopicEntity> {
    // Try to extract metadata from frontmatter
    let metadata: TopicMetadata = {};
    let contentBody = markdown;

    try {
      const parsed = parseMarkdownWithFrontmatter(
        markdown,
        topicFrontmatterSchema,
      );
      metadata = parsed.metadata;
      contentBody = parsed.content;
    } catch {
      // No frontmatter, use entire content as body
    }

    // Parse the topic body to get keywords and sources
    const topicMetadata: TopicMetadata = {};
    try {
      const parsed = this.parseTopicBody(contentBody);
      if (parsed.keywords.length > 0) {
        topicMetadata.keywords = parsed.keywords;
      }
      if (parsed.sources.length > 0) {
        topicMetadata.sourceCount = parsed.sources.length;
      }
    } catch {
      // Parsing failed, no additional metadata
    }

    return {
      content: markdown, // Keep full markdown including frontmatter
      entityType: "topic",
      metadata: { ...topicMetadata, ...metadata }, // Merge parsed and frontmatter metadata
    };
  }

  /**
   * Extract metadata for search/filtering
   */
  public extractMetadata(entity: TopicEntity): Record<string, unknown> {
    // Return entity metadata if it exists
    if (entity.metadata && Object.keys(entity.metadata).length > 0) {
      return entity.metadata;
    }

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
   */
  public generateFrontMatter(entity: TopicEntity): string {
    const metadata = this.extractMetadata(entity);

    if (Object.keys(metadata).length > 0) {
      return generateFrontmatter(metadata);
    }

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
