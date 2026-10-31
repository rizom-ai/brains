import { BaseEntityAdapter, EntityValidationError } from "@brains/plugins";
import { slugify } from "@brains/utils/string-utils";
import {
  assertPublishedDeckHasPublishedAt,
  deckSchema,
  deckFrontmatterSchema,
  type DeckEntity,
  type DeckFrontmatter,
  type DeckMetadata,
} from "../schemas/deck";

const MISSING_SLIDES_MESSAGE =
  "Invalid deck: markdown must contain slide separators (---) to be a valid presentation";

/** True when the body has a standalone --- line between slides. */
export function hasSlideSeparators(body: string): boolean {
  return /^---$/m.test(body);
}

/**
 * Deck formatter for managing presentation deck entities
 * Validates that content contains proper slide separators (---) on both parse and serialize
 */
export class DeckAdapter extends BaseEntityAdapter<
  DeckEntity,
  DeckMetadata,
  DeckFrontmatter
> {
  constructor() {
    super({
      entityType: "deck",
      purpose: "A slide-deck presentation.",
      schema: deckSchema,
      frontmatterSchema: deckFrontmatterSchema,
      supportsCoverImage: true,
    });
  }

  /**
   * Validate that content has proper slide structure
   */
  private validateSlideStructure(content: string): void {
    if (hasSlideSeparators(content)) return;
    // A validation error on the body, so editors show it beside the text
    // being drafted instead of failing the request.
    throw new EntityValidationError(
      "deck",
      Object.assign(new Error(MISSING_SLIDES_MESSAGE), {
        issues: [{ path: ["body"], message: MISSING_SLIDES_MESSAGE }],
      }),
    );
  }

  /**
   * Convert entity to markdown with frontmatter
   * Parses existing frontmatter from content, merges slug from metadata
   */
  public override toMarkdown(entity: DeckEntity): string {
    const body = this.extractBody(entity.content);
    this.validateSlideStructure(body);

    const frontmatter = this.parseFrontMatter(
      entity.content,
      deckFrontmatterSchema,
    );

    assertPublishedDeckHasPublishedAt(frontmatter);

    // Merge auto-generated slug from metadata if missing in frontmatter
    const completeFrontmatter = {
      ...frontmatter,
      slug: frontmatter.slug ?? entity.metadata.slug,
    };

    return this.buildMarkdown(body, completeFrontmatter);
  }

  /**
   * Parse markdown into a deck entity
   * Validates that content has proper slide structure
   * Auto-generates slug from title if not provided in frontmatter
   */
  public fromMarkdown(markdown: string): Partial<DeckEntity> {
    const frontmatter = this.parseFrontmatter(markdown);
    const content = this.extractBody(markdown);

    assertPublishedDeckHasPublishedAt(frontmatter);

    this.validateSlideStructure(content);

    // Auto-generate slug from title if not provided
    const slug = frontmatter.slug ?? slugify(frontmatter.title);
    const status = frontmatter.status;

    return {
      entityType: "deck",
      content: markdown,
      metadata: {
        slug,
        title: frontmatter.title,
        description: frontmatter.description,
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
    return entity.metadata.title;
  }

  /**
   * Generate a brief summary for search results
   */
  public generateSummary(entity: DeckEntity): string {
    if (entity.metadata.description) return entity.metadata.description;
    return `Presentation: ${entity.metadata.title}`;
  }

  /**
   * Generate frontmatter for the entity
   */
  public override generateFrontMatter(entity: DeckEntity): string {
    return this.toMarkdown(entity);
  }

  public buildStub(input: { id: string; title: string }): {
    content: string;
    metadata: DeckMetadata;
  } {
    const frontmatter: DeckFrontmatter = {
      title: input.title,
      slug: input.id,
      status: "generating",
    };
    return {
      // A title slide before the separator: a body that is only "---" reads
      // as an opening frontmatter fence and is dropped, and the stub then
      // fails slide validation every time it is stored.
      content: this.buildMarkdown(`# ${input.title}\n\n---\n`, frontmatter),
      metadata: {
        title: input.title,
        slug: input.id,
        status: "generating",
      },
    };
  }
}

export const deckAdapter: DeckAdapter = new DeckAdapter();
