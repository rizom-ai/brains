import type { EntityAdapter } from "@brains/plugins";
import {
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
} from "@brains/plugins";
import { z } from "@brains/utils";
import { deckSchema, type DeckEntity } from "../schemas/deck";

/**
 * Frontmatter schema for deck markdown files
 */
const deckFrontmatterSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  author: z.string().optional(),
});

/**
 * Deck formatter for managing presentation deck entities
 * Validates that content contains proper slide separators (---) on both parse and serialize
 */
export class DeckFormatter implements EntityAdapter<DeckEntity> {
  public readonly entityType = "deck" as const;
  public readonly schema = deckSchema;

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
   */
  public toMarkdown(entity: DeckEntity): string {
    // Validate before serializing
    this.validateSlideStructure(entity.content);

    // Build frontmatter, filtering out undefined values
    const frontmatter: Record<string, string> = {
      title: entity.title,
    };

    if (entity.description !== undefined) {
      frontmatter["description"] = entity.description;
    }
    if (entity.author !== undefined) {
      frontmatter["author"] = entity.author;
    }

    return generateMarkdownWithFrontmatter(entity.content, frontmatter);
  }

  /**
   * Parse markdown into a deck entity
   * Validates that content has proper slide structure
   */
  public fromMarkdown(markdown: string): Partial<DeckEntity> {
    const { metadata, content } = parseMarkdownWithFrontmatter(
      markdown,
      deckFrontmatterSchema,
    );

    // Validate presentation structure
    this.validateSlideStructure(content);

    return {
      entityType: "deck",
      content,
      title: metadata.title,
      description: metadata.description,
      author: metadata.author,
    };
  }

  /**
   * Extract metadata from entity
   */
  public extractMetadata(entity: DeckEntity): Record<string, unknown> {
    return {
      title: entity.title,
      description: entity.description,
      author: entity.author,
    };
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
    return entity.description || `Presentation: ${entity.title}`;
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
