import type { EntityAdapter } from "@brains/plugins";
import { parseMarkdownWithFrontmatter, StructuredContentFormatter } from "@brains/plugins";
import type { z } from "@brains/utils";
import { linkSchema, linkBodySchema, type LinkEntity, type LinkBody } from "../schemas/link";

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
        { key: "content", label: "Content", type: "string" },
        { key: "tags", label: "Tags", type: "array", itemType: "string" },
        { key: "domain", label: "Domain", type: "string" },
        { key: "capturedAt", label: "Captured", type: "string" },
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
    content: string;
    tags: string[];
  }): string {
    const formatter = this.createFormatter(params.title);
    return formatter.format({
      url: params.url,
      description: params.description,
      summary: params.summary,
      content: params.content,
      tags: params.tags,
      domain: new URL(params.url).hostname,
      capturedAt: new Date().toISOString(),
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
   * Convert entity to markdown
   */
  public toMarkdown(entity: LinkEntity): string {
    return entity.content;
  }

  /**
   * Convert markdown to entity
   */
  public fromMarkdown(markdown: string): Partial<LinkEntity> {
    return {
      content: markdown,
      entityType: "link",
    };
  }

  /**
   * Extract metadata (empty for links as all data is in content)
   */
  public extractMetadata(_entity: LinkEntity): Record<string, unknown> {
    return {};
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