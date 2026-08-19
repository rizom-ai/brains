import {
  brainCharacterSchema,
  brainCharacterBodySchema,
  type BrainCharacterEntity,
  type BrainCharacter,
} from "./brain-character-schema";
import { SingletonFrontmatterAdapter } from "./singleton-frontmatter-adapter";

/**
 * Entity adapter for Brain Character entities
 * Uses frontmatter format for CMS compatibility
 */
export class BrainCharacterAdapter extends SingletonFrontmatterAdapter<
  BrainCharacterEntity,
  BrainCharacter
> {
  constructor() {
    super({
      entityType: "brain-character",
      purpose: "The brain's own identity, character, and purpose (singleton).",
      schema: brainCharacterSchema,
      frontmatterSchema: brainCharacterBodySchema,
      isSingleton: true,
      hasBody: false,
    });
  }

  /**
   * Create character content in frontmatter format
   */
  public createCharacterContent(params: {
    name: string;
    role: string;
    purpose: string;
    values: string[];
  }): string {
    return this.buildMarkdown("", params);
  }

  /**
   * Parse character body from content
   */
  public parseCharacterBody(content: string): BrainCharacter {
    return this.parseFrontmatter(content);
  }

  /**
   * Convert character entity to frontmatter markdown. The character has no
   * body, so serialization is exactly the regenerated frontmatter.
   */
  public override toMarkdown(entity: BrainCharacterEntity): string {
    return this.generateFrontMatter(entity);
  }

  /**
   * Create partial entity from markdown content
   */
  public fromMarkdown(markdown: string): Partial<BrainCharacterEntity> {
    return {
      content: markdown,
      entityType: "brain-character",
    };
  }

  /**
   * Extract metadata for search/filtering
   */
  public override extractMetadata(
    entity: BrainCharacterEntity,
  ): Record<string, unknown> {
    const data = this.parseFrontmatter(entity.content);
    return {
      role: data.role,
      values: data.values,
    };
  }
}
