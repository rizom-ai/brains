import type { EntityAdapter } from "@brains/plugins";
import {
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/plugins";
import type { z } from "@brains/utils";
import {
  websiteMetricsSchema,
  websiteMetricsFrontmatterSchema,
} from "../schemas/website-metrics";
import type {
  WebsiteMetricsEntity,
  WebsiteMetricsMetadata,
  WebsiteMetricsFrontmatter,
} from "../schemas/website-metrics";

/**
 * Adapter for website metrics entities
 * Stores all data (including breakdowns) in content as YAML frontmatter
 */
export class WebsiteMetricsAdapter
  implements EntityAdapter<WebsiteMetricsEntity, WebsiteMetricsMetadata>
{
  public readonly entityType = "website-metrics";
  public readonly schema = websiteMetricsSchema;

  /**
   * Convert entity to markdown with frontmatter
   * Parses frontmatter from content, regenerates with body
   */
  public toMarkdown(entity: WebsiteMetricsEntity): string {
    // Parse existing frontmatter from content
    const { content: body, metadata: frontmatter } =
      parseMarkdownWithFrontmatter(
        entity.content,
        websiteMetricsFrontmatterSchema,
      );

    // Regenerate markdown with frontmatter
    return generateMarkdownWithFrontmatter(body, frontmatter);
  }

  /**
   * Create entity from markdown
   * Parses frontmatter and extracts metadata (queryable subset)
   */
  public fromMarkdown(markdown: string): Partial<WebsiteMetricsEntity> {
    const { metadata: frontmatter } = parseMarkdownWithFrontmatter(
      markdown,
      websiteMetricsFrontmatterSchema,
    );

    // Extract metadata (queryable subset) from frontmatter
    const metadata: WebsiteMetricsMetadata = {
      date: frontmatter.date,
      pageviews: frontmatter.pageviews,
      visitors: frontmatter.visitors,
    };

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
   * Generate frontmatter string from entity
   * Parses frontmatter from content and generates YAML
   */
  public generateFrontMatter(entity: WebsiteMetricsEntity): string {
    const { metadata: frontmatter } = parseMarkdownWithFrontmatter(
      entity.content,
      websiteMetricsFrontmatterSchema,
    );
    return generateFrontmatter(frontmatter);
  }

  /**
   * Parse full frontmatter data from entity content
   * Use this to access breakdown arrays (topPages, topReferrers, etc.)
   */
  public parseFrontmatterData(
    entity: WebsiteMetricsEntity,
  ): WebsiteMetricsFrontmatter {
    const { metadata: frontmatter } = parseMarkdownWithFrontmatter(
      entity.content,
      websiteMetricsFrontmatterSchema,
    );
    return frontmatter;
  }
}
