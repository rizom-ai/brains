import type { EntityAdapter } from "@brains/plugins";
import {
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
} from "@brains/plugins";
import { type z, slugify } from "@brains/utils";
import {
  deckSchema,
  deckFrontmatterSchema,
  type DeckEntity,
} from "../schemas/deck";

/**
 * Deck formatter for managing presentation deck entities
 * Validates that content contains proper slide separators (---) on both parse and serialize
 */
export class DeckFormatter implements EntityAdapter<DeckEntity> {
  public readonly entityType = "deck" as const;
  public readonly schema = deckSchema;
  public readonly supportsCoverImage = true;
  public readonly frontmatterSchema = deckFrontmatterSchema;

  /**
   * Validate that content has proper slide structure
   */
  private validateSlideStructure(content: string): void {
    const hasSlides = /^---$/gm.test(content);
    if (!hasSlides) {
      throw new Error(
        "Invalid deck: markdown must contain slide separators (---) to be a valid presentation",
      );
    }
  }

  /**
   * Convert entity to markdown with frontmatter
   * Syncs slug from metadata back to frontmatter
   */
  public toMarkdown(entity: DeckEntity): string {
    // Validate before serializing
    this.validateSlideStructure(entity.content);

    // Build frontmatter, filtering out undefined values
    const frontmatter = Object.fromEntries(
      Object.entries({
        title: entity.title,
        status: entity.status,
        slug: entity.metadata.slug,
        description: entity.description,
        author: entity.author,
        publishedAt: entity.publishedAt,
        event: entity.event,
        coverImageId: entity.coverImageId,
      }).filter(([, v]) => v !== undefined),
    );

    return generateMarkdownWithFrontmatter(entity.content, frontmatter);
  }

  /**
   * Parse markdown into a deck entity
   * Validates that content has proper slide structure
   * Auto-generates slug from title if not provided in frontmatter
   */
  public fromMarkdown(markdown: string): Partial<DeckEntity> {
    const { metadata: frontmatter, content } = parseMarkdownWithFrontmatter(
      markdown,
      deckFrontmatterSchema,
    );

    // Validate presentation structure
    this.validateSlideStructure(content);

    // Auto-generate slug from title if not provided
    const slug = frontmatter.slug ?? slugify(frontmatter.title);
    // Status defaults to draft if not specified
    const status = frontmatter.status ?? "draft";

    return {
      entityType: "deck",
      content, // Store body WITHOUT frontmatter (like original)
      title: frontmatter.title,
      description: frontmatter.description,
      author: frontmatter.author,
      status,
      publishedAt: frontmatter.publishedAt,
      event: frontmatter.event,
      coverImageId: frontmatter.coverImageId,
      metadata: {
        slug, // Generated from title if not in frontmatter
        title: frontmatter.title,
        status,
        publishedAt: frontmatter.publishedAt,
        coverImageId: frontmatter.coverImageId,
      },
    };
  }

  /**
   * Extract metadata for search/filtering
   */
  public extractMetadata(entity: DeckEntity): Record<string, unknown> {
    return entity.metadata;
  }

  /**
   * Generate a human-readable title from deck
   */
  public generateTitle(entity: DeckEntity): string {
    return entity.title;
  }

  /**
   * Generate a brief summary for search results
   */
  public generateSummary(entity: DeckEntity): string {
    return entity.description ?? `Presentation: ${entity.title}`;
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
  public generateFrontMatter(entity: DeckEntity): string {
    return this.toMarkdown(entity);
  }
}
