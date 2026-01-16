import type { EntityAdapter } from "@brains/plugins";
import {
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/plugins";
import type { z } from "@brains/utils";
import {
  socialMetricsSchema,
  socialMetricsMetadataSchema,
} from "../schemas/social-metrics";
import type {
  SocialMetricsEntity,
  SocialMetricsMetadata,
} from "../schemas/social-metrics";

/**
 * Adapter for social metrics entities
 * Stores metrics data in frontmatter, minimal content body
 */
export class SocialMetricsAdapter
  implements EntityAdapter<SocialMetricsEntity, SocialMetricsMetadata>
{
  public readonly entityType = "social-metrics";
  public readonly schema = socialMetricsSchema;

  /**
   * Convert entity to markdown with frontmatter
   */
  public toMarkdown(entity: SocialMetricsEntity): string {
    const contentBody = this.createContentBody(entity.metadata);
    return generateMarkdownWithFrontmatter(contentBody, entity.metadata);
  }

  /**
   * Create content body from metadata
   */
  private createContentBody(metadata: SocialMetricsMetadata): string {
    const lines: string[] = [];
    lines.push(`# Social Metrics: ${metadata.platform}`);
    lines.push("");
    lines.push(`**Post**: ${metadata.platformPostId}`);
    lines.push(`**Snapshot**: ${metadata.snapshotDate}`);
    lines.push("");
    lines.push("## Engagement");
    lines.push("");
    lines.push(`- **Impressions**: ${metadata.impressions.toLocaleString()}`);
    lines.push(`- **Likes**: ${metadata.likes.toLocaleString()}`);
    lines.push(`- **Comments**: ${metadata.comments.toLocaleString()}`);
    lines.push(`- **Shares**: ${metadata.shares.toLocaleString()}`);
    lines.push(
      `- **Engagement Rate**: ${(metadata.engagementRate * 100).toFixed(2)}%`,
    );
    lines.push("");
    return lines.join("\n");
  }

  /**
   * Create entity from markdown
   */
  public fromMarkdown(markdown: string): Partial<SocialMetricsEntity> {
    const { metadata } = parseMarkdownWithFrontmatter(
      markdown,
      socialMetricsMetadataSchema,
    );

    return {
      entityType: "social-metrics",
      content: markdown,
      metadata,
    };
  }

  /**
   * Extract metadata from entity
   */
  public extractMetadata(entity: SocialMetricsEntity): SocialMetricsMetadata {
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
  public generateFrontMatter(entity: SocialMetricsEntity): string {
    return generateFrontmatter(entity.metadata);
  }
}
