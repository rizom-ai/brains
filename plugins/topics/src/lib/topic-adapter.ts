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

export class TopicAdapter implements EntityAdapter<TopicEntity, TopicMetadata> {
  public readonly entityType = "topic";
  public readonly schema = topicEntitySchema;
  public readonly frontmatterSchema = topicFrontmatterSchema;

  private buildBody(content: string, sources: TopicSource[]): string {
    if (sources.length === 0) return content;
    return content + "\n\n## Sources\n" + SourceListFormatter.format(sources);
  }

  private buildFrontmatter(
    title: string,
    keywords: string[],
  ): Record<string, unknown> {
    return {
      title,
      ...(keywords.length > 0 && { keywords }),
    };
  }

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

  public toMarkdown(entity: TopicEntity): string {
    const parsed = this.parseTopicBody(entity.content);
    const body = this.buildBody(parsed.content, parsed.sources);
    return generateMarkdownWithFrontmatter(
      body,
      this.buildFrontmatter(parsed.title, parsed.keywords),
    );
  }

  public fromMarkdown(markdown: string): Partial<TopicEntity> {
    const content = this.convertToFrontmatter(markdown);
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

  public extractMetadata(_entity: TopicEntity): TopicMetadata {
    return {};
  }

  public parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    const { metadata } = parseMarkdownWithFrontmatter(markdown, schema);
    return metadata;
  }

  public generateFrontMatter(entity: TopicEntity): string {
    const parsed = this.parseTopicBody(entity.content);
    const fullMarkdown = generateMarkdownWithFrontmatter(
      "",
      this.buildFrontmatter(parsed.title, parsed.keywords),
    );
    // Extract just the frontmatter block (between --- markers)
    const match = fullMarkdown.match(/^---\n[\s\S]*?\n---/);
    return match ? match[0] : "";
  }

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

  public createTopicBody(params: {
    title: string;
    content: string;
    keywords: string[];
    sources: TopicSource[];
  }): string {
    const body = this.buildBody(params.content, params.sources);
    return generateMarkdownWithFrontmatter(
      body,
      this.buildFrontmatter(params.title, params.keywords),
    );
  }

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

      const body = this.buildBody(parsedContent, sources);
      return generateMarkdownWithFrontmatter(
        body,
        this.buildFrontmatter(title, keywords),
      );
    } catch {
      return markdown;
    }
  }
}
