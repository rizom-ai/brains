import type { EntityAdapter } from "@brains/entity-service";
import {
  FrontmatterContentHelper,
  parseMarkdownWithFrontmatter,
} from "@brains/entity-service";
import { StructuredContentFormatter, type z } from "@brains/utils";
import {
  brainCharacterSchema,
  brainCharacterBodySchema,
  type BrainCharacterEntity,
  type BrainCharacter,
} from "./brain-character-schema";

/**
 * Entity adapter for Brain Character entities
 * Uses frontmatter format for CMS compatibility
 * Supports reading legacy structured content format for backward compatibility
 */
export class BrainCharacterAdapter
  implements EntityAdapter<BrainCharacterEntity>
{
  public readonly entityType = "brain-character";
  public readonly schema = brainCharacterSchema;
  public readonly frontmatterSchema = brainCharacterBodySchema;
  public readonly isSingleton = true;
  public readonly hasBody = false;

  private readonly contentHelper = new FrontmatterContentHelper(
    brainCharacterBodySchema,
    () =>
      new StructuredContentFormatter(brainCharacterBodySchema, {
        title: "Brain Identity",
        mappings: [
          { key: "name", label: "Name", type: "string" },
          { key: "role", label: "Role", type: "string" },
          { key: "purpose", label: "Purpose", type: "string" },
          {
            key: "values",
            label: "Values",
            type: "array",
            itemType: "string",
          },
        ],
      }),
  );

  /**
   * Create character content in frontmatter format
   */
  public createCharacterContent(params: {
    name: string;
    role: string;
    purpose: string;
    values: string[];
  }): string {
    return this.contentHelper.format(params);
  }

  /**
   * Parse character body from content (handles both frontmatter and legacy formats)
   */
  public parseCharacterBody(content: string): BrainCharacter {
    return this.contentHelper.parse(content);
  }

  /**
   * Convert character entity to frontmatter markdown
   */
  public toMarkdown(entity: BrainCharacterEntity): string {
    const data = this.contentHelper.parse(entity.content);
    return this.contentHelper.format(data);
  }

  /**
   * Create partial entity from markdown content
   * Auto-converts legacy structured content to frontmatter format
   */
  public fromMarkdown(markdown: string): Partial<BrainCharacterEntity> {
    return {
      content: this.contentHelper.convertToFrontmatter(markdown),
      entityType: "brain-character",
    };
  }

  /**
   * Extract metadata for search/filtering
   */
  public extractMetadata(
    entity: BrainCharacterEntity,
  ): Record<string, unknown> {
    const data = this.contentHelper.parse(entity.content);
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
    const { metadata } = parseMarkdownWithFrontmatter(markdown, schema);
    return metadata;
  }

  /**
   * Generate frontmatter for the entity
   */
  public generateFrontMatter(entity: BrainCharacterEntity): string {
    const data = this.contentHelper.parse(entity.content);
    return this.contentHelper.toFrontmatterString(data);
  }
}
