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
 * Maximum length of content to use for slug generation
 */
const SLUG_CONTENT_MAX_LENGTH = 50;

/**
 * Entity adapter for social post entities
 * Frontmatter stored in content, key fields duplicated in metadata for fast queries
 */
export class SocialPostAdapter
  implements EntityAdapter<SocialPost, SocialPostMetadata>
{
  public readonly entityType = "social-post" as const;
  public readonly schema = socialPostSchema;

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
   * Syncs frontmatter → metadata for key searchable fields
   * Auto-generates slug from content if not provided
   */
  public fromMarkdown(markdown: string): Partial<SocialPost> {
    // Parse frontmatter
    const { metadata: frontmatter } = parseMarkdownWithFrontmatter(
      markdown,
      socialPostFrontmatterSchema,
    );

    // Auto-generate slug from content preview
    const slug = this.generateSlugFromContent(frontmatter.content);

    // Sync key fields from frontmatter to metadata for fast queries
    return {
      content: markdown, // Store full markdown including frontmatter
      entityType: "social-post",
      metadata: {
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
   * Create social post content with frontmatter
   */
  public createPostContent(
    frontmatter: SocialPostFrontmatter,
    body: string,
  ): string {
    return generateMarkdownWithFrontmatter(body, frontmatter);
  }

  /**
   * Generate a URL-safe slug from content
   * Uses first SLUG_CONTENT_MAX_LENGTH characters of content
   */
  private generateSlugFromContent(content: string): string {
    // Take first N characters of content for slug
    const preview = content.slice(0, SLUG_CONTENT_MAX_LENGTH);
    return slugify(preview);
  }
}

// Create default instance
export const socialPostAdapter = new SocialPostAdapter();
