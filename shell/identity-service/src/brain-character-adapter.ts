import type { EntityAdapter } from "@brains/entity-service";
import {
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/entity-service";
import type { z } from "@brains/utils";
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
export class BrainCharacterAdapter
  implements EntityAdapter<BrainCharacterEntity>
{
  public readonly entityType = "brain-character";
  public readonly schema = brainCharacterSchema;
  public readonly frontmatterSchema = brainCharacterBodySchema;
  public readonly isSingleton = true;
  public readonly hasBody = false;

  /**
   * Create character content in frontmatter format
   */
  public createCharacterContent(params: {
    name: string;
    role: string;
    purpose: string;
    values: string[];
  }): string {
    return generateMarkdownWithFrontmatter("", params);
  }

  /**
   * Parse character body from content
   */
  public parseCharacterBody(content: string): BrainCharacter {
    return parseMarkdownWithFrontmatter(content, brainCharacterBodySchema)
      .metadata;
  }

  /**
   * Convert character entity to frontmatter markdown
   */
  public toMarkdown(entity: BrainCharacterEntity): string {
    const data = parseMarkdownWithFrontmatter(
      entity.content,
      brainCharacterBodySchema,
    ).metadata;
    return generateMarkdownWithFrontmatter("", data);
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
  public extractMetadata(
    entity: BrainCharacterEntity,
  ): Record<string, unknown> {
    const data = parseMarkdownWithFrontmatter(
      entity.content,
      brainCharacterBodySchema,
    ).metadata;
    return {
      role: data.role,
      values: data.values,
    };
  }

  /**
   * Parse frontmatter from markdown
   */
  public parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    return parseMarkdownWithFrontmatter(markdown, schema).metadata;
  }

  /**
   * Generate frontmatter for the entity
   */
  public generateFrontMatter(entity: BrainCharacterEntity): string {
    const data = parseMarkdownWithFrontmatter(
      entity.content,
      brainCharacterBodySchema,
    ).metadata;
    return generateFrontmatter(data);
  }
}
