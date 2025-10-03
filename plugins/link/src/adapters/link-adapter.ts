import type { EntityAdapter } from "@brains/plugins";
import {
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
  StructuredContentFormatter,
} from "@brains/plugins";
import { z, SourceListFormatter } from "@brains/utils";
import {
  linkSchema,
  linkBodySchema,
  linkSourceSchema,
  type LinkEntity,
  type LinkBody,
  type LinkSource,
} from "../schemas/link";

/**
 * Link adapter for managing link entities with structured content
 */
export class LinkAdapter implements EntityAdapter<LinkEntity> {
  public readonly entityType = "link" as const;
  public readonly schema = linkSchema;

  /**
   * Create a structured content formatter for links
   */
  private createFormatter(title: string): StructuredContentFormatter<LinkBody> {
    return new StructuredContentFormatter(linkBodySchema, {
      title,
      mappings: [
        { key: "url", label: "URL", type: "string" },
        { key: "description", label: "Description", type: "string" },
        { key: "summary", label: "Summary", type: "string" },
        {
          key: "keywords",
          label: "Keywords",
          type: "array",
          itemType: "string",
        },
        { key: "domain", label: "Domain", type: "string" },
        { key: "capturedAt", label: "Captured", type: "string" },
        {
          key: "source",
          label: "Source",
          type: "custom",
          formatter: (value: unknown): string => {
            if (!value) return "";
            const source = linkSourceSchema.parse(value);
            return SourceListFormatter.format([source]);
          },
          parser: (text: string): unknown => {
            if (!text || text.trim() === "") return undefined;
            const sources = SourceListFormatter.parse(text);
            return sources[0];
          },
        },
      ],
    });
  }

  /**
   * Create structured link body content
   */
  public createLinkBody(params: {
    title: string;
    url: string;
    description: string;
    summary: string;
    keywords: string[];
    source: LinkSource;
  }): string {
    const formatter = this.createFormatter(params.title);
    return formatter.format({
      url: params.url,
      description: params.description,
      summary: params.summary,
      keywords: params.keywords,
      domain: new URL(params.url).hostname,
      capturedAt: new Date().toISOString(),
      source: params.source,
    });
  }

  /**
   * Parse link body content
   */
  public parseLinkBody(body: string): LinkBody & { title: string } {
    // Extract title from H1
    const titleMatch = body.match(/^#\s+(.+)$/m);
    const title = titleMatch?.[1]?.trim() ?? "Untitled Link";

    const formatter = this.createFormatter(title);
    const parsed = formatter.parse(body);

    return { ...parsed, title };
  }

  /**
   * Convert entity to markdown with metadata in frontmatter
   */
  public toMarkdown(entity: LinkEntity): string {
    // If entity has metadata, include it as frontmatter
    if (entity.metadata && Object.keys(entity.metadata).length > 0) {
      return generateMarkdownWithFrontmatter(entity.content, entity.metadata);
    }
    return entity.content;
  }

  /**
   * Convert markdown to entity, extracting metadata from frontmatter
   */
  public fromMarkdown(markdown: string): Partial<LinkEntity> {
    // Try to parse frontmatter for metadata
    const { metadata } = parseMarkdownWithFrontmatter(
      markdown,
      z.record(z.unknown()).default({}),
    );

    return {
      content: markdown, // Keep the full markdown including frontmatter
      entityType: "link",
      metadata:
        metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  }

  /**
   * Extract metadata from entity
   */
  public extractMetadata(entity: LinkEntity): Record<string, unknown> {
    // Return the entity's metadata if it exists
    return entity.metadata ?? {};
  }

  /**
   * Generate a human-readable title from link content
   */
  public generateTitle(entity: LinkEntity): string {
    const parsed = this.parseLinkBody(entity.content);
    return parsed.title;
  }

  /**
   * Generate a brief summary for search results
   */
  public generateSummary(entity: LinkEntity): string {
    const parsed = this.parseLinkBody(entity.content);
    return parsed.description || parsed.summary.substring(0, 200) + "...";
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
   * Links don't use frontmatter - all data is in content body
   */
  public generateFrontMatter(entity: LinkEntity): string {
    return entity.content;
  }
}
