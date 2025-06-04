import { z } from "zod";
import type { BaseEntity } from "@brains/types";
import { createFrontmatterAdapter } from "@brains/utils";

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

  // Use frontmatter utility with default config (excludes system fields)
  private readonly frontmatterAdapter = createFrontmatterAdapter<BaseEntity>();

  /**
   * Convert entity to markdown with frontmatter
   * For base entities, this typically results in content only (no frontmatter)
   */
  toMarkdown(entity: BaseEntity): string {
    return this.frontmatterAdapter.toMarkdown(entity);
  }

  /**
   * Extract entity fields from markdown
   * Returns only entity-specific fields (none for BaseEntity)
   */
  fromMarkdown(markdown: string): Partial<BaseEntity> {
    return this.frontmatterAdapter.fromMarkdown(markdown);
  }

  /**
   * Extract metadata for search/filtering
   * For base entities, no metadata since no entity-specific fields
   */
  extractMetadata(entity: BaseEntity): Record<string, unknown> {
    return this.frontmatterAdapter.extractMetadata(entity);
  }

  /**
   * Parse frontmatter metadata from markdown
   */
  parseFrontMatter(markdown: string): Record<string, unknown> {
    return this.frontmatterAdapter.parseFrontMatter(markdown);
  }

  /**
   * Generate frontmatter for markdown
   * For base entities, this returns empty string since no entity-specific fields
   */
  generateFrontMatter(entity: BaseEntity): string {
    return this.frontmatterAdapter.generateFrontMatter(entity);
  }
}
