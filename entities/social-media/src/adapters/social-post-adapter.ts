import {
  generateMarkdownWithFrontmatter,
  parseMarkdown,
  parseMarkdownWithFrontmatter,
  slugify,
} from "@brains/sdk/entities";
import {
  socialPostCreateFrontmatterSchema,
  socialPostFrontmatterSchema,
  type SocialPost,
  type SocialPostFrontmatter,
  type SocialPostMetadata,
} from "../schemas/social-post";

/**
 * Reads and writes the markdown a social post is stored as.
 *
 * This used to be a full `BaseEntityAdapter`. The declarative entity builds
 * its adapter from the `markdown` codec on `socialPost`, so the class's
 * `toMarkdown` and `buildStub` stopped running once the package converted.
 * What is left is what callers still reach for directly.
 */
export class SocialPostAdapter {
  /**
   * The metadata a piece of post markdown indexes.
   *
   * The lenient creation schema, so a direct "save this post" carrying only
   * a title does not fail on a missing platform or status.
   */
  public deriveMetadata(markdown: string): SocialPostMetadata {
    const frontmatter = parseMarkdownWithFrontmatter(
      markdown,
      socialPostCreateFrontmatterSchema,
    ).metadata;
    const platform = frontmatter.platform ?? "linkedin";
    return {
      title: frontmatter.title,
      slug: `${platform}-${slugify(frontmatter.title)}`,
      platform,
      status: frontmatter.status ?? "draft",
      ...(frontmatter.publishedAt === undefined
        ? {}
        : { publishedAt: frontmatter.publishedAt }),
      ...(frontmatter.platformPostId === undefined
        ? {}
        : { platformPostId: frontmatter.platformPostId }),
    };
  }

  /** Parse social post frontmatter from entity content. */
  public parsePostFrontmatter(entity: SocialPost): SocialPostFrontmatter {
    return parseMarkdownWithFrontmatter(
      entity.content,
      socialPostFrontmatterSchema,
    ).metadata;
  }

  /** Extract post text from entity body (not frontmatter). */
  public getPostContent(entity: SocialPost): string {
    return parseMarkdown(entity.content).content;
  }

  /** Create social post content with frontmatter. */
  public createPostContent(
    frontmatter: SocialPostFrontmatter,
    body: string,
  ): string {
    return generateMarkdownWithFrontmatter(body, frontmatter);
  }
}

export const socialPostAdapter: SocialPostAdapter = new SocialPostAdapter();
