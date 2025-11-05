import type { EntityAdapter } from "@brains/plugins";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/plugins";
import { z, slugify } from "@brains/utils";
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
export class BlogPostAdapter
  implements EntityAdapter<BlogPost, BlogPostMetadata>
{
  public readonly entityType = "post" as const;
  public readonly schema = blogPostSchema;

  /**
   * Convert blog post entity to markdown with frontmatter
   * Merges auto-generated metadata (like slug) back into frontmatter
   */
  public toMarkdown(entity: BlogPost): string {
    // Extract the body content without any existing frontmatter
    let contentBody = entity.content;
    try {
      const parsed = parseMarkdownWithFrontmatter(entity.content, z.object({}));
      contentBody = parsed.content;
    } catch {
      // Content doesn't have frontmatter, use as-is
    }

    // Parse frontmatter from content and regenerate with it
    try {
      const { metadata: frontmatter } = parseMarkdownWithFrontmatter(
        entity.content,
        blogPostFrontmatterSchema,
      );

      // Merge auto-generated slug from metadata if missing in frontmatter
      // This ensures the slug gets written back to the file after auto-generation
      const completeFrontmatter = {
        ...frontmatter,
        slug: frontmatter.slug ?? entity.metadata.slug,
      };

      return generateMarkdownWithFrontmatter(contentBody, completeFrontmatter);
    } catch {
      // No valid frontmatter, return content as-is
      return contentBody;
    }
  }

  /**
   * Parse markdown with frontmatter to create partial blog post entity
   * Syncs frontmatter → metadata for key searchable fields
   * Auto-generates slug from title if not provided in frontmatter
   */
  public fromMarkdown(markdown: string): Partial<BlogPost> {
    // Parse frontmatter
    const { metadata: frontmatter } = parseMarkdownWithFrontmatter(
      markdown,
      blogPostFrontmatterSchema,
    );

    // Auto-generate slug from title if not provided
    const slug = frontmatter.slug ?? slugify(frontmatter.title);

    // Sync key fields from frontmatter to metadata for fast queries
    return {
      content: markdown, // Store full markdown including frontmatter
      entityType: "post",
      metadata: {
        title: frontmatter.title,
        slug, // Generated from title if not in frontmatter
        status: frontmatter.status,
        publishedAt: frontmatter.publishedAt,
        seriesName: frontmatter.seriesName,
        seriesIndex: frontmatter.seriesIndex,
      },
    };
  }

  /**
   * Extract metadata for search/filtering
   */
  public extractMetadata(entity: BlogPost): BlogPostMetadata {
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
   * Generate frontmatter for blog post entity
   */
  public generateFrontMatter(entity: BlogPost): string {
    // Parse frontmatter from content and regenerate it
    try {
      const { metadata } = parseMarkdownWithFrontmatter(
        entity.content,
        blogPostFrontmatterSchema,
      );
      return generateFrontmatter(metadata);
    } catch {
      return "";
    }
  }

  /**
   * Parse blog post frontmatter from entity content
   */
  public parsePostFrontmatter(entity: BlogPost): BlogPostFrontmatter {
    const { metadata } = parseMarkdownWithFrontmatter(
      entity.content,
      blogPostFrontmatterSchema,
    );
    return metadata;
  }

  /**
   * Create blog post content with frontmatter
   */
  public createPostContent(
    frontmatter: BlogPostFrontmatter,
    body: string,
  ): string {
    return generateMarkdownWithFrontmatter(body, frontmatter);
  }
}

// Create default instance
export const blogPostAdapter = new BlogPostAdapter();
