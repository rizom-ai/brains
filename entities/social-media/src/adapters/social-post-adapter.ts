import { BaseEntityAdapter } from "@brains/plugins";
import { slugify } from "@brains/utils";
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
export class SocialPostAdapter extends BaseEntityAdapter<
  SocialPost,
  SocialPostMetadata,
  SocialPostFrontmatter
> {
  constructor() {
    super({
      entityType: "social-post",
      schema: socialPostSchema,
      frontmatterSchema: socialPostFrontmatterSchema,
      supportsCoverImage: true,
    });
  }

  /**
   * Convert social post entity to markdown with frontmatter
   *
   * IMPORTANT: Uses entity.metadata as the authoritative source for metadata fields.
   * Frontmatter-only fields (not in metadata schema) are preserved from entity.content.
   */
  public toMarkdown(entity: SocialPost): string {
    let contentBody = "";
    let existingFrontmatter: Partial<SocialPostFrontmatter> = {};

    try {
      existingFrontmatter = this.parseFrontMatter(
        entity.content,
        socialPostFrontmatterSchema,
      );
      contentBody = this.extractBody(entity.content);
    } catch {
      contentBody = entity.content;
    }

    const frontmatter: SocialPostFrontmatter = {
      ...existingFrontmatter,
      title: entity.metadata.title,
      platform: entity.metadata.platform,
      status: entity.metadata.status,
      ...(entity.metadata.publishedAt !== undefined && {
        publishedAt: entity.metadata.publishedAt,
      }),
      ...(entity.metadata.platformPostId !== undefined && {
        platformPostId: entity.metadata.platformPostId,
      }),
    };

    return this.buildMarkdown(contentBody, frontmatter);
  }

  /**
   * Parse markdown with frontmatter to create partial social post entity
   * Auto-generates slug from platform + title
   */
  public fromMarkdown(markdown: string): Partial<SocialPost> {
    const frontmatter = this.parseFrontMatter(
      markdown,
      socialPostFrontmatterSchema,
    );
    const slug = `${frontmatter.platform}-${slugify(frontmatter.title)}`;

    return {
      content: markdown,
      entityType: "social-post",
      metadata: {
        title: frontmatter.title,
        slug,
        platform: frontmatter.platform,
        status: frontmatter.status,
        publishedAt: frontmatter.publishedAt,
        platformPostId: frontmatter.platformPostId,
      },
    };
  }

  /** Parse social post frontmatter from entity content */
  public parsePostFrontmatter(entity: SocialPost): SocialPostFrontmatter {
    return this.parseFrontMatter(entity.content, socialPostFrontmatterSchema);
  }

  /** Extract post text from entity body (not frontmatter) */
  public getPostContent(entity: SocialPost): string {
    return this.extractBody(entity.content);
  }

  /** Create social post content with frontmatter */
  public createPostContent(
    frontmatter: SocialPostFrontmatter,
    body: string,
  ): string {
    return this.buildMarkdown(body, frontmatter);
  }
}

// Create default instance
export const socialPostAdapter = new SocialPostAdapter();
