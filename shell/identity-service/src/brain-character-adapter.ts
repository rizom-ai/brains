import { BaseEntityAdapter } from "@brains/entity-service";
import {
  brainCharacterSchema,
  brainCharacterBodySchema,
  type BrainCharacterEntity,
  type BrainCharacter,
} from "./brain-character-schema";

/**
 * Entity adapter for Brain Character entities
 * Uses frontmatter format for CMS compatibility
 */
export class BrainCharacterAdapter extends BaseEntityAdapter<BrainCharacterEntity> {
  constructor() {
    super({
      entityType: "brain-character",
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
    return this.parseFrontmatter(content) as BrainCharacter;
  }

  /**
   * Convert character entity to frontmatter markdown
   */
  public toMarkdown(entity: BrainCharacterEntity): string {
    const data = this.parseFrontmatter(entity.content);
    return this.buildMarkdown("", data as Record<string, unknown>);
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
    const data = this.parseFrontmatter(entity.content) as BrainCharacter;
    return {
      role: data.role,
      values: data.values,
    };
  }

  /**
   * Generate frontmatter for the entity
   */
  public override generateFrontMatter(entity: BrainCharacterEntity): string {
    const data = this.parseFrontmatter(entity.content);
    return this.buildMarkdown("", data as Record<string, unknown>);
  }
}
