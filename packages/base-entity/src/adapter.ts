import { z } from "zod";
import type { BaseEntity } from "@brains/types";
import { parseMarkdown, generateMarkdown } from "@brains/utils";
import matter from "gray-matter";

/**
 * Interface for entity adapter - imported here since it's not exported from @brains/types
 * Handles conversion between entities and markdown following the hybrid storage model
 */
export interface EntityAdapter<T extends BaseEntity> {
  entityType: string;
  schema: z.ZodSchema<T>;

  // Convert entity to markdown content (may include frontmatter for entity-specific fields)
  toMarkdown(entity: T): string;

  // Extract entity-specific fields from markdown
  // Returns Partial<T> as core fields come from database
  fromMarkdown(markdown: string): Partial<T>;

  // Extract metadata from entity for search/filtering
  extractMetadata(entity: T): Record<string, unknown>;

  // Parse frontmatter metadata from markdown
  parseFrontMatter(markdown: string): Record<string, unknown>;

  // Generate frontmatter for markdown
  generateFrontMatter(entity: T): string;
}

/**
 * Adapter for base entity type - handles serialization/deserialization
 *
 * Provides a fallback implementation for the EntityAdapter interface
 * that works with any entity conforming to the BaseEntity interface.
 */
export class BaseEntityAdapter implements EntityAdapter<BaseEntity> {
  public readonly entityType = "base";
  public readonly schema = z.object({
    id: z.string(),
    entityType: z.string(),
    title: z.string(),
    content: z.string(),
    created: z.string().datetime(),
    updated: z.string().datetime(),
    tags: z.array(z.string()),
  });

  /**
   * Convert entity to markdown with frontmatter
   */
  toMarkdown(entity: BaseEntity): string {
    // Extract content field
    const { content, ...frontmatter } = entity;

    // Generate markdown with frontmatter
    return generateMarkdown(frontmatter, content || "");
  }

  /**
   * Extract entity fields from markdown
   */
  fromMarkdown(markdown: string): Partial<BaseEntity> {
    const { frontmatter, content } = parseMarkdown(markdown);

    // Return parsed fields
    return {
      content,
      ...frontmatter,
    };
  }

  /**
   * Extract metadata for search/filtering
   */
  extractMetadata(entity: BaseEntity): Record<string, unknown> {
    return {
      title: entity.title,
      tags: entity.tags,
      created: entity.created,
      updated: entity.updated,
    };
  }

  /**
   * Parse frontmatter metadata from markdown
   */
  parseFrontMatter(markdown: string): Record<string, unknown> {
    const { frontmatter } = parseMarkdown(markdown);
    return frontmatter;
  }

  /**
   * Generate frontmatter for markdown
   */
  generateFrontMatter(entity: BaseEntity): string {
    const { content: _content, ...frontmatter } = entity;

    // Generate YAML frontmatter
    return matter.stringify("", frontmatter).trim();
  }
}
