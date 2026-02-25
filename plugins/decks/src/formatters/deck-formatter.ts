import { BaseEntityAdapter } from "@brains/plugins";
import { type z, slugify } from "@brains/utils";
import {
  deckSchema,
  deckFrontmatterSchema,
  type DeckEntity,
  type DeckMetadata,
} from "../schemas/deck";

type DeckFrontmatter = z.infer<typeof deckFrontmatterSchema>;

/**
 * Deck formatter for managing presentation deck entities
 * Validates that content contains proper slide separators (---) on both parse and serialize
 */
export class DeckFormatter extends BaseEntityAdapter<
  DeckEntity,
  DeckMetadata,
  DeckFrontmatter
> {
  constructor() {
    super({
      entityType: "deck",
      schema: deckSchema,
      frontmatterSchema: deckFrontmatterSchema,
      supportsCoverImage: true,
    });
  }

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

    return this.buildMarkdown(entity.content, frontmatter);
  }

  /**
   * Parse markdown into a deck entity
   * Validates that content has proper slide structure
   * Auto-generates slug from title if not provided in frontmatter
   */
  public fromMarkdown(markdown: string): Partial<DeckEntity> {
    const frontmatter = this.parseFrontmatter(markdown);
    const content = this.extractBody(markdown);

    // Validate presentation structure
    this.validateSlideStructure(content);

    // Auto-generate slug from title if not provided
    const slug = frontmatter.slug ?? slugify(frontmatter.title);
    // Status defaults to draft if not specified
    const status = frontmatter.status ?? "draft";

    return {
      entityType: "deck",
      content,
      title: frontmatter.title,
      description: frontmatter.description,
      author: frontmatter.author,
      status,
      publishedAt: frontmatter.publishedAt,
      event: frontmatter.event,
      coverImageId: frontmatter.coverImageId,
      metadata: {
        slug,
        title: frontmatter.title,
        status,
        publishedAt: frontmatter.publishedAt,
        coverImageId: frontmatter.coverImageId,
      },
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
    return entity.description ?? `Presentation: ${entity.title}`;
  }

  /**
   * Generate frontmatter for the entity
   */
  public override generateFrontMatter(entity: DeckEntity): string {
    return this.toMarkdown(entity);
  }
}
