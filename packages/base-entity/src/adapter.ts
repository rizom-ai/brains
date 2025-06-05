import { z } from "zod";
import type { BaseEntity } from "@brains/types";
import { parseMarkdownWithFrontmatter } from "@brains/utils";

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
  parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>
  ): TFrontmatter;

  // Generate frontmatter for markdown
  generateFrontMatter(entity: T): string;
}

/**
 * Adapter for base entity type - handles serialization/deserialization
 *
 * Following the new architecture, system fields (id, entityType, created, updated)
 * are NOT included in frontmatter. Only entity-specific fields go in frontmatter.
 * For BaseEntity, there are no entity-specific fields, so frontmatter is typically empty.
 */
export class BaseEntityAdapter implements EntityAdapter<BaseEntity> {
  public readonly entityType = "base";
  public readonly schema = z.object({
    id: z.string(),
    entityType: z.string(),
    content: z.string(),
    created: z.string().datetime(),
    updated: z.string().datetime(),
  });

  /**
   * Convert entity to markdown
   * For base entities, we return the content as-is without adding any frontmatter
   */
  toMarkdown(entity: BaseEntity): string {
    // BaseEntity returns content as-is, no frontmatter added
    return entity.content;
  }

  /**
   * Extract entity fields from markdown
   * For BaseEntity, we return the entire markdown as content without any parsing
   * This preserves the content exactly as-is, including any frontmatter
   */
  fromMarkdown(markdown: string): Partial<BaseEntity> {
    // BaseEntity preserves content exactly as-is
    return {
      content: markdown
    };
  }

  /**
   * Extract metadata for search/filtering
   * For base entities, no metadata since no entity-specific fields
   */
  extractMetadata(_entity: BaseEntity): Record<string, unknown> {
    // BaseEntity has no metadata
    return {};
  }

  /**
   * Parse frontmatter metadata from markdown
   */
  parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>
  ): TFrontmatter {
    const { metadata } = parseMarkdownWithFrontmatter(markdown, schema);
    return metadata;
  }

  /**
   * Generate frontmatter for markdown
   * For base entities, this returns empty string since no frontmatter is added
   */
  generateFrontMatter(_entity: BaseEntity): string {
    // BaseEntity doesn't use frontmatter
    return "";
  }
}
