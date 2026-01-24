import type { EntityAdapter } from "@brains/plugins";
import {
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/plugins";
import type { z } from "@brains/utils";
import {
  pageMetricsSchema,
  pageMetricsFrontmatterSchema,
} from "../schemas/page-metrics";
import type {
  PageMetricsEntity,
  PageMetricsMetadata,
  PageMetricsFrontmatter,
} from "../schemas/page-metrics";

/**
 * Adapter for page metrics entities
 * Stores history data in content as YAML frontmatter
 */
export class PageMetricsAdapter
  implements EntityAdapter<PageMetricsEntity, PageMetricsMetadata>
{
  public readonly entityType = "page-metrics";
  public readonly schema = pageMetricsSchema;

  /**
   * Convert entity to markdown with frontmatter
   */
  public toMarkdown(entity: PageMetricsEntity): string {
    const { content: body, metadata: frontmatter } =
      parseMarkdownWithFrontmatter(
        entity.content,
        pageMetricsFrontmatterSchema,
      );

    return generateMarkdownWithFrontmatter(body, frontmatter);
  }

  /**
   * Create entity from markdown
   */
  public fromMarkdown(markdown: string): Partial<PageMetricsEntity> {
    const { metadata: frontmatter } = parseMarkdownWithFrontmatter(
      markdown,
      pageMetricsFrontmatterSchema,
    );

    const metadata: PageMetricsMetadata = {
      path: frontmatter.path,
      totalPageviews: frontmatter.totalPageviews,
      lastUpdated: frontmatter.lastUpdated,
    };

    return {
      entityType: "page-metrics",
      content: markdown,
      metadata,
    };
  }

  /**
   * Extract metadata from entity
   */
  public extractMetadata(entity: PageMetricsEntity): PageMetricsMetadata {
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
   */
  public generateFrontMatter(entity: PageMetricsEntity): string {
    const { metadata: frontmatter } = parseMarkdownWithFrontmatter(
      entity.content,
      pageMetricsFrontmatterSchema,
    );
    return generateFrontmatter(frontmatter);
  }

  /**
   * Parse full frontmatter data from entity content
   * Use this to access history array
   */
  public parseFrontmatterData(
    entity: PageMetricsEntity,
  ): PageMetricsFrontmatter {
    const { metadata: frontmatter } = parseMarkdownWithFrontmatter(
      entity.content,
      pageMetricsFrontmatterSchema,
    );
    // Ensure defaults are applied (history defaults to [])
    return pageMetricsFrontmatterSchema.parse(frontmatter);
  }
}
