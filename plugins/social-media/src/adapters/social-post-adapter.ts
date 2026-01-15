import type { EntityAdapter } from "@brains/plugins";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/plugins";
import { z, slugify } from "@brains/utils";
import {
  socialPostSchema,
  socialPostFrontmatterSchema,
  type SocialPost,
  type SocialPostFrontmatter,
  type SocialPostMetadata,
} from "../schemas/social-post";

/**
 * Entity adapter for social post entities
 * Frontmatter stored in content, key fields duplicated in metadata for fast queries
 * Slug is auto-generated from platform + title (e.g., "linkedin-product-launch")
 */
export class SocialPostAdapter
  implements EntityAdapter<SocialPost, SocialPostMetadata>
{
  public readonly entityType = "social-post" as const;
  public readonly schema = socialPostSchema;
  public readonly supportsCoverImage = true;

  /**
   * Convert social post entity to markdown with frontmatter
   */
  public toMarkdown(entity: SocialPost): string {
    // Extract the body content without any existing frontmatter
    let contentBody = "";
    try {
      const parsed = parseMarkdownWithFrontmatter(entity.content, z.object({}));
      contentBody = parsed.content;
    } catch {
      // Content doesn't have frontmatter, use as-is
      contentBody = entity.content;
    }

    // Parse frontmatter from content and regenerate with it
    try {
      const { metadata: frontmatter } = parseMarkdownWithFrontmatter(
        entity.content,
        socialPostFrontmatterSchema,
      );

      return generateMarkdownWithFrontmatter(contentBody, frontmatter);
    } catch {
      // No valid frontmatter, return content as-is
      return contentBody;
    }
  }

  /**
   * Parse markdown with frontmatter to create partial social post entity
   * Post text is in markdown body, metadata in frontmatter
   * Auto-generates slug from platform + title
   */
  public fromMarkdown(markdown: string): Partial<SocialPost> {
    // Parse frontmatter and body
    const { metadata: frontmatter } = parseMarkdownWithFrontmatter(
      markdown,
      socialPostFrontmatterSchema,
    );

    // Auto-generate slug from platform + title
    const slug = this.generateSlug(frontmatter.platform, frontmatter.title);

    // Sync key fields from frontmatter to metadata for fast queries
    return {
      content: markdown, // Store full markdown including frontmatter
      entityType: "social-post",
      metadata: {
        title: frontmatter.title,
        slug,
        platform: frontmatter.platform,
        status: frontmatter.status,
        queueOrder: frontmatter.queueOrder,
        publishedAt: frontmatter.publishedAt,
      },
    };
  }

  /**
   * Extract metadata for search/filtering
   */
  public extractMetadata(entity: SocialPost): SocialPostMetadata {
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
   * Generate frontmatter for social post entity
   */
  public generateFrontMatter(entity: SocialPost): string {
    try {
      const { metadata } = parseMarkdownWithFrontmatter(
        entity.content,
        socialPostFrontmatterSchema,
      );
      return generateFrontmatter(metadata);
    } catch {
      return "";
    }
  }

  /**
   * Parse social post frontmatter from entity content
   * Ensures all defaults are applied (e.g., retryCount)
   */
  public parsePostFrontmatter(entity: SocialPost): SocialPostFrontmatter {
    const { metadata } = parseMarkdownWithFrontmatter(
      entity.content,
      socialPostFrontmatterSchema,
    );
    // Ensure retryCount has the default value applied
    return {
      ...metadata,
      retryCount: metadata.retryCount ?? 0,
    };
  }

  /**
   * Extract post text from entity body (not frontmatter)
   */
  public getPostContent(entity: SocialPost): string {
    const { content: body } = parseMarkdownWithFrontmatter(
      entity.content,
      socialPostFrontmatterSchema,
    );
    return body;
  }

  /**
   * Create social post content with frontmatter
   */
  public createPostContent(
    frontmatter: SocialPostFrontmatter,
    body: string,
  ): string {
    return generateMarkdownWithFrontmatter(body, frontmatter);
  }

  /**
   * Generate a URL-safe slug from platform + title + date
   * Format: {platform}-{slugified-title}-{YYYYMMDD} (e.g., "linkedin-product-launch-20260114")
   */
  private generateSlug(platform: string, title: string): string {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
    return `${platform}-${slugify(title)}-${dateStr}`;
  }
}

// Create default instance
export const socialPostAdapter = new SocialPostAdapter();
