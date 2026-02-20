import { BaseEntityAdapter } from "@brains/plugins";
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
export class LinkAdapter extends BaseEntityAdapter<LinkEntity, LinkMetadata> {
  constructor() {
    super({
      entityType: "link",
      schema: linkSchema,
      frontmatterSchema: linkFrontmatterSchema,
    });
  }

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
    return this.buildMarkdown(body, frontmatter);
  }

  /**
   * Parse link content to extract frontmatter and summary
   */
  public parseLinkContent(content: string): {
    frontmatter: LinkFrontmatter;
    summary: string;
  } {
    return {
      frontmatter: this.parseFrontMatter(content, linkFrontmatterSchema),
      summary: this.extractBody(content).trim(),
    };
  }

  public toMarkdown(entity: LinkEntity): string {
    return entity.content;
  }

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
}
