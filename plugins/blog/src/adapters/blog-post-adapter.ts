import { BaseEntityAdapter } from "@brains/plugins";
import { slugify } from "@brains/utils";
import {
  blogPostSchema,
  blogPostFrontmatterSchema,
  type BlogPost,
  type BlogPostFrontmatter,
  type BlogPostMetadata,
} from "../schemas/blog-post";

/**
 * Entity adapter for blog post entities
 * Following summary plugin pattern - frontmatter in content, key fields duplicated in metadata
 */
export class BlogPostAdapter extends BaseEntityAdapter<
  BlogPost,
  BlogPostMetadata
> {
  constructor() {
    super({
      entityType: "post",
      schema: blogPostSchema,
      frontmatterSchema: blogPostFrontmatterSchema,
      supportsCoverImage: true,
    });
  }

  /**
   * Convert blog post entity to markdown with frontmatter
   * Merges auto-generated metadata (like slug) back into frontmatter
   */
  public toMarkdown(entity: BlogPost): string {
    const body = this.extractBody(entity.content);
    try {
      const frontmatter = this.parseFrontMatter(
        entity.content,
        blogPostFrontmatterSchema,
      );

      // Merge auto-generated slug from metadata if missing in frontmatter
      const completeFrontmatter = {
        ...frontmatter,
        slug: frontmatter.slug ?? entity.metadata.slug,
      };

      return this.buildMarkdown(body, completeFrontmatter);
    } catch {
      return body;
    }
  }

  /**
   * Parse markdown with frontmatter to create partial blog post entity
   * Syncs frontmatter → metadata for key searchable fields
   * Auto-generates slug from title if not provided in frontmatter
   */
  public fromMarkdown(markdown: string): Partial<BlogPost> {
    const frontmatter = this.parseFrontMatter(
      markdown,
      blogPostFrontmatterSchema,
    );
    const slug = frontmatter.slug ?? slugify(frontmatter.title);

    return {
      content: markdown,
      entityType: "post",
      metadata: {
        title: frontmatter.title,
        slug,
        status: frontmatter.status,
        publishedAt: frontmatter.publishedAt,
        seriesName: frontmatter.seriesName,
        seriesIndex: frontmatter.seriesIndex,
      },
    };
  }

  /** Parse blog post frontmatter from entity content */
  public parsePostFrontmatter(entity: BlogPost): BlogPostFrontmatter {
    return this.parseFrontMatter(entity.content, blogPostFrontmatterSchema);
  }

  /** Create blog post content with frontmatter */
  public createPostContent(
    frontmatter: BlogPostFrontmatter,
    body: string,
  ): string {
    return this.buildMarkdown(body, frontmatter);
  }
}

// Create default instance
export const blogPostAdapter = new BlogPostAdapter();
