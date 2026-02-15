import type { EntityAdapter } from "@brains/plugins";
import {
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
} from "@brains/plugins";
import type { z } from "@brains/utils";
import { SourceListFormatter, StructuredContentFormatter } from "@brains/utils";
import {
  topicEntitySchema,
  topicBodySchema,
  topicFrontmatterSchema,
  topicSourceSchema,
  type TopicEntity,
  type TopicBody,
  type TopicSource,
  type TopicMetadata,
} from "../schemas/topic";

/**
 * Entity adapter for Topic entities
 * Uses frontmatter for title + keywords, body for content + sources
 * Supports reading legacy structured content format for backward compatibility
 */
export class TopicAdapter implements EntityAdapter<TopicEntity, TopicMetadata> {
  public readonly entityType = "topic";
  public readonly schema = topicEntitySchema;
  public readonly frontmatterSchema = topicFrontmatterSchema;

  constructor() {}

  /**
   * Create a legacy formatter with the given title (for backward compatibility)
   */
  private createLegacyFormatter(
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
   * Convert topic entity to frontmatter markdown
   * Title and keywords go in frontmatter, content is body, sources appended as ## Sources
   */
  public toMarkdown(entity: TopicEntity): string {
    const parsed = this.parseTopicBody(entity.content);

    // Build body: content text + sources section
    let body = parsed.content;
    if (parsed.sources.length > 0) {
      body += "\n\n## Sources\n" + SourceListFormatter.format(parsed.sources);
    }

    const frontmatter = {
      title: parsed.title,
      ...(parsed.keywords.length > 0 && { keywords: parsed.keywords }),
    };

    return generateMarkdownWithFrontmatter(body, frontmatter);
  }

  /**
   * Extract topic-specific fields from markdown
   * Auto-converts legacy structured content to frontmatter format
   * Parses sources from the body to restore metadata for batch-extract tracking
   */
  public fromMarkdown(markdown: string): Partial<TopicEntity> {
    // Auto-convert to frontmatter format
    const content = this.convertToFrontmatter(markdown);

    // Parse sources from body content using SourceListFormatter
    const sourcesSection = SourceListFormatter.extractSection(content);
    const sources = sourcesSection
      ? SourceListFormatter.parse(sourcesSection)
      : [];

    return {
      content,
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
   */
  public generateFrontMatter(entity: TopicEntity): string {
    const parsed = this.parseTopicBody(entity.content);
    const frontmatter = {
      title: parsed.title,
      ...(parsed.keywords.length > 0 && { keywords: parsed.keywords }),
    };
    const fullMarkdown = generateMarkdownWithFrontmatter("", frontmatter);
    // Extract just the frontmatter block (between --- markers)
    const match = fullMarkdown.match(/^---\n[\s\S]*?\n---/);
    return match ? match[0] : "";
  }

  /**
   * Parse topic body to extract structured content
   * Handles both frontmatter and legacy structured content formats
   */
  public parseTopicBody(
    body: string,
  ): TopicBody & { formatted: string; title: string } {
    // Frontmatter format
    if (body.startsWith("---")) {
      try {
        const { metadata, content: bodyText } = parseMarkdownWithFrontmatter(
          body,
          topicFrontmatterSchema,
        );

        // Extract content (everything before ## Sources)
        const contentText = bodyText
          .replace(/\n*## Sources[\s\S]*$/, "")
          .trim();

        // Extract sources from body
        const sourcesSection = SourceListFormatter.extractSection(bodyText);
        const sources = sourcesSection
          ? SourceListFormatter.parse(sourcesSection)
          : [];

        return {
          content: contentText,
          keywords: metadata.keywords ?? [],
          sources,
          formatted: body,
          title: metadata.title,
        };
      } catch {
        return {
          content: body,
          keywords: [],
          sources: [],
          formatted: body,
          title: "Unknown Topic",
        };
      }
    }

    // Legacy: structured content format
    try {
      const titleMatch = body.match(/^#\s+(.+)$/m);
      const title = titleMatch?.[1]?.trim() ?? "Unknown Topic";

      const formatter = this.createLegacyFormatter(title);
      const parsed = formatter.parse(body);

      return {
        ...parsed,
        formatted: body,
        title,
      };
    } catch {
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
   * Create topic body in frontmatter format
   */
  public createTopicBody(params: {
    title: string;
    content: string;
    keywords: string[];
    sources: TopicSource[];
  }): string {
    // Build body: content text + sources section
    let body = params.content;
    if (params.sources.length > 0) {
      body += "\n\n## Sources\n" + SourceListFormatter.format(params.sources);
    }

    const frontmatter = {
      title: params.title,
      ...(params.keywords.length > 0 && { keywords: params.keywords }),
    };

    return generateMarkdownWithFrontmatter(body, frontmatter);
  }

  /**
   * Convert legacy structured content to frontmatter format
   * If already frontmatter, return as-is
   */
  private convertToFrontmatter(markdown: string): string {
    if (markdown.startsWith("---")) {
      return markdown;
    }

    try {
      const titleMatch = markdown.match(/^#\s+(.+)$/m);
      const title = titleMatch?.[1]?.trim() ?? "Unknown Topic";

      const formatter = this.createLegacyFormatter(title);
      const {
        content: parsedContent,
        keywords,
        sources,
      } = formatter.parse(markdown);

      let body = parsedContent;
      if (sources.length > 0) {
        body += "\n\n## Sources\n" + SourceListFormatter.format(sources);
      }

      const frontmatter = {
        title,
        ...(keywords.length > 0 && { keywords }),
      };

      return generateMarkdownWithFrontmatter(body, frontmatter);
    } catch {
      return markdown;
    }
  }
}
