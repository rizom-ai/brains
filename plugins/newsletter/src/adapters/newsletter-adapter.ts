import type { EntityAdapter } from "@brains/plugins";
import {
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/plugins";
import type { z } from "@brains/utils";
import {
  newsletterSchema,
  newsletterFrontmatterSchema,
  type Newsletter,
  type NewsletterMetadata,
} from "../schemas/newsletter";

/**
 * Adapter for newsletter entities
 * Stores metadata in frontmatter, content body contains newsletter HTML/markdown
 */
export class NewsletterAdapter
  implements EntityAdapter<Newsletter, NewsletterMetadata>
{
  public readonly entityType = "newsletter";
  public readonly schema = newsletterSchema;
  public readonly frontmatterSchema = newsletterFrontmatterSchema;

  /**
   * Convert entity to markdown with frontmatter
   */
  public toMarkdown(entity: Newsletter): string {
    // Extract body content without frontmatter
    let contentBody = entity.content;
    try {
      const { content } = parseMarkdownWithFrontmatter(
        entity.content,
        newsletterFrontmatterSchema,
      );
      contentBody = content;
    } catch {
      // Content doesn't have frontmatter, use as-is
    }

    return generateMarkdownWithFrontmatter(contentBody, entity.metadata);
  }

  /**
   * Create entity from markdown
   */
  public fromMarkdown(markdown: string): Partial<Newsletter> {
    const { metadata } = parseMarkdownWithFrontmatter(
      markdown,
      newsletterFrontmatterSchema,
    );

    return {
      entityType: "newsletter",
      content: markdown,
      metadata,
    };
  }

  /**
   * Extract metadata from entity
   */
  public extractMetadata(entity: Newsletter): NewsletterMetadata {
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
  public generateFrontMatter(entity: Newsletter): string {
    return generateFrontmatter(entity.metadata);
  }
}

export const newsletterAdapter = new NewsletterAdapter();
