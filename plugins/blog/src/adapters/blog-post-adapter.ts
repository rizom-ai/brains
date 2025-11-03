import type { EntityAdapter } from "@brains/plugins";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/plugins";
import { z } from "@brains/utils";
import {
  blogPostSchema,
  blogPostMetadataSchema,
  type BlogPost,
} from "../schemas/blog-post";

// Schema for parsing frontmatter
const frontmatterSchema = z.object({
  id: z.string(),
  entityType: z.literal("post"),
  created: z.string().datetime(),
  updated: z.string().datetime(),
  metadata: blogPostMetadataSchema,
});

/**
 * Entity adapter for blog post entities
 */
export class BlogPostAdapter implements EntityAdapter<BlogPost> {
  public readonly entityType = "post" as const;
  public readonly schema = blogPostSchema;

  /**
   * Convert blog post entity to markdown with frontmatter
   */
  public toMarkdown(entity: BlogPost): string {
    const metadata: Record<string, unknown> = {
      id: entity.id,
      entityType: entity.entityType,
      created: entity.created,
      updated: entity.updated,
      metadata: entity.metadata,
    };

    // Parse content to extract just the body (without frontmatter if present)
    try {
      const { content: body } = parseMarkdownWithFrontmatter(
        entity.content,
        z.object({}),
      );
      return generateMarkdownWithFrontmatter(body, metadata);
    } catch {
      // Content doesn't have valid frontmatter, use as-is
      return generateMarkdownWithFrontmatter(entity.content, metadata);
    }
  }

  /**
   * Parse markdown with frontmatter to create partial blog post entity
   */
  public fromMarkdown(markdown: string): Partial<BlogPost> {
    const { metadata } = parseMarkdownWithFrontmatter(
      markdown,
      frontmatterSchema,
    );

    return {
      id: metadata.id,
      entityType: "post",
      content: markdown, // Store full markdown including frontmatter
      created: metadata.created,
      updated: metadata.updated,
      metadata: metadata.metadata,
    };
  }

  /**
   * Extract metadata for search/filtering
   */
  public extractMetadata(entity: BlogPost): Record<string, unknown> {
    return {
      title: entity.metadata.title,
      slug: entity.metadata.slug,
      status: entity.metadata.status,
      publishedAt: entity.metadata.publishedAt,
      author: entity.metadata.author,
      seriesName: entity.metadata.seriesName,
      seriesIndex: entity.metadata.seriesIndex,
    };
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
    const metadata: Record<string, unknown> = {
      id: entity.id,
      entityType: entity.entityType,
      created: entity.created,
      updated: entity.updated,
      metadata: entity.metadata,
    };

    return generateFrontmatter(metadata);
  }
}

// Create default instance
export const blogPostAdapter = new BlogPostAdapter();
