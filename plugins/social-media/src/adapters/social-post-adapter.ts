import type { EntityAdapter } from "@brains/plugins";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/plugins";
import { type z, slugify } from "@brains/utils";
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
  public readonly frontmatterSchema = socialPostFrontmatterSchema;

  /**
   * Convert social post entity to markdown with frontmatter
   *
   * IMPORTANT: Uses entity.metadata as the authoritative source for metadata fields.
   * Frontmatter-only fields (not in metadata schema) are preserved from entity.content.
   */
  public toMarkdown(entity: SocialPost): string {
    // Extract the body content and existing frontmatter from content
    let contentBody = "";
    let existingFrontmatter: Partial<SocialPostFrontmatter> = {};

    try {
      const parsed = parseMarkdownWithFrontmatter(
        entity.content,
        socialPostFrontmatterSchema,
      );
      contentBody = parsed.content;
      existingFrontmatter = parsed.metadata;
    } catch {
      // Content doesn't have valid frontmatter, use content as body
      contentBody = entity.content;
    }

    // Build frontmatter: metadata fields from entity.metadata (authoritative),
    // frontmatter-only fields from existingFrontmatter (preserved)
    const frontmatter: SocialPostFrontmatter = {
      // Start with existing frontmatter (preserves frontmatter-only fields like
      // retryCount, lastError, platformPostId, coverImageId, sourceEntityId, etc.)
      ...existingFrontmatter,

      // Override with entity.metadata (authoritative source for these fields)
      title: entity.metadata.title,
      platform: entity.metadata.platform,
      status: entity.metadata.status,

      // Conditionally include optional metadata fields
      ...(entity.metadata.publishedAt !== undefined && {
        publishedAt: entity.metadata.publishedAt,
      }),
      // Only include queueOrder if defined in metadata (allows removal)
      ...(entity.metadata.queueOrder !== undefined && {
        queueOrder: entity.metadata.queueOrder,
      }),
    };

    // Remove queueOrder if not in metadata (was removed during publish)
    if (entity.metadata.queueOrder === undefined) {
      delete frontmatter.queueOrder;
    }

    return generateMarkdownWithFrontmatter(contentBody, frontmatter);
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
   * Generate a URL-safe slug from platform + title
   * Format: {platform}-{slugified-title} (e.g., "linkedin-product-launch")
   */
  private generateSlug(platform: string, title: string): string {
    return `${platform}-${slugify(title)}`;
  }
}

// Create default instance
export const socialPostAdapter = new SocialPostAdapter();
