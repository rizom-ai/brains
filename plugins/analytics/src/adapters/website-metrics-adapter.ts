import type { EntityAdapter } from "@brains/plugins";
import {
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/plugins";
import type { z } from "@brains/utils";
import {
  websiteMetricsSchema,
  websiteMetricsMetadataSchema,
} from "../schemas/website-metrics";
import type {
  WebsiteMetricsEntity,
  WebsiteMetricsMetadata,
} from "../schemas/website-metrics";

/**
 * Adapter for website metrics entities
 * Stores metrics data in frontmatter, minimal content body
 */
export class WebsiteMetricsAdapter
  implements EntityAdapter<WebsiteMetricsEntity, WebsiteMetricsMetadata>
{
  public readonly entityType = "website-metrics";
  public readonly schema = websiteMetricsSchema;

  /**
   * Convert entity to markdown with frontmatter
   */
  public toMarkdown(entity: WebsiteMetricsEntity): string {
    const contentBody = this.createContentBody(entity.metadata);
    return generateMarkdownWithFrontmatter(contentBody, entity.metadata);
  }

  /**
   * Create content body from metadata
   */
  private createContentBody(metadata: WebsiteMetricsMetadata): string {
    const lines: string[] = [];
    lines.push(`# Website Metrics: ${metadata.period}`);
    lines.push("");
    lines.push(`**Period**: ${metadata.startDate} to ${metadata.endDate}`);
    lines.push("");
    lines.push("## Summary");
    lines.push("");
    lines.push(`- **Pageviews**: ${metadata.pageviews.toLocaleString()}`);
    lines.push(`- **Visitors**: ${metadata.visitors.toLocaleString()}`);
    lines.push(`- **Visits**: ${metadata.visits.toLocaleString()}`);
    lines.push(`- **Bounce Rate**: ${(metadata.bounceRate * 100).toFixed(1)}%`);
    lines.push(`- **Avg Time on Page**: ${metadata.avgTimeOnPage.toFixed(1)}s`);
    lines.push("");
    return lines.join("\n");
  }

  /**
   * Create entity from markdown
   */
  public fromMarkdown(markdown: string): Partial<WebsiteMetricsEntity> {
    const { metadata } = parseMarkdownWithFrontmatter(
      markdown,
      websiteMetricsMetadataSchema,
    );

    return {
      entityType: "website-metrics",
      content: markdown,
      metadata,
    };
  }

  /**
   * Extract metadata from entity
   */
  public extractMetadata(entity: WebsiteMetricsEntity): WebsiteMetricsMetadata {
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
  public generateFrontMatter(entity: WebsiteMetricsEntity): string {
    return generateFrontmatter(entity.metadata);
  }
}
