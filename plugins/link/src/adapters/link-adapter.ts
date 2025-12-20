import type { EntityAdapter } from "@brains/plugins";
import {
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
} from "@brains/plugins";
import type { z } from "@brains/utils";
import {
  linkSchema,
  linkFrontmatterSchema,
  type LinkEntity,
  type LinkFrontmatter,
  type LinkMetadata,
  type LinkSource,
} from "../schemas/link";

/**
 * Link adapter for managing link entities with frontmatter
 * Following blog pattern: frontmatter contains structured data, body is the summary
 */
export class LinkAdapter implements EntityAdapter<LinkEntity, LinkMetadata> {
  public readonly entityType = "link" as const;
  public readonly schema = linkSchema;

  /**
   * Create link content with frontmatter and summary body
   */
  public createLinkContent(params: {
    status: LinkFrontmatter["status"];
    title: string;
    url: string;
    description?: string;
    summary?: string;
    keywords: string[];
    domain: string;
    capturedAt: string;
    source: LinkSource;
  }): string {
    const frontmatter: LinkFrontmatter = {
      status: params.status,
      title: params.title,
      url: params.url,
      description: params.description,
      keywords: params.keywords,
      domain: params.domain,
      capturedAt: params.capturedAt,
      source: params.source,
    };

    const body = params.summary ?? "";
    return generateMarkdownWithFrontmatter(body, frontmatter);
  }

  /**
   * Parse link content to extract frontmatter and summary
   */
  public parseLinkContent(content: string): {
    frontmatter: LinkFrontmatter;
    summary: string;
  } {
    const { metadata, content: body } = parseMarkdownWithFrontmatter(
      content,
      linkFrontmatterSchema,
    );

    return {
      frontmatter: metadata,
      summary: body.trim(),
    };
  }

  /**
   * Convert entity to markdown (returns content as-is, already has frontmatter)
   */
  public toMarkdown(entity: LinkEntity): string {
    return entity.content;
  }

  /**
   * Convert markdown to entity, extracting metadata from frontmatter
   * Syncs key fields from frontmatter to metadata for fast queries
   */
  public fromMarkdown(markdown: string): Partial<LinkEntity> {
    const { frontmatter } = this.parseLinkContent(markdown);

    return {
      content: markdown,
      entityType: "link",
      metadata: {
        title: frontmatter.title,
        status: frontmatter.status,
      },
    };
  }

  /**
   * Extract metadata from entity for filtering and display
   */
  public extractMetadata(entity: LinkEntity): LinkMetadata {
    return entity.metadata;
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
  public generateFrontMatter(entity: LinkEntity): string {
    return entity.content;
  }
}
