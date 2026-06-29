import { BaseEntityAdapter } from "@brains/entity-service";
import { z } from "@brains/utils/zod-v4";
import {
  brainCharacterSchema,
  brainCharacterBodySchema,
  type BrainCharacterEntity,
  type BrainCharacter,
} from "./brain-character-schema";

const frontmatterRecordSchema = z.record(z.string(), z.unknown());

/**
 * Entity adapter for Brain Character entities
 * Uses frontmatter format for CMS compatibility
 */
export class BrainCharacterAdapter extends BaseEntityAdapter<
  BrainCharacterEntity,
  Record<string, unknown>,
  BrainCharacter
> {
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
    return this.parseFrontmatter(content);
  }

  /**
   * Convert character entity to frontmatter markdown
   */
  public override toMarkdown(entity: BrainCharacterEntity): string {
    const data = this.parseFrontmatter(entity.content);
    return this.buildMarkdown("", frontmatterRecordSchema.parse(data));
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

  /**
   * Generate frontmatter for the entity
   */
  public override generateFrontMatter(entity: BrainCharacterEntity): string {
    const data = this.parseFrontmatter(entity.content);
    return this.buildMarkdown("", frontmatterRecordSchema.parse(data));
  }
}
