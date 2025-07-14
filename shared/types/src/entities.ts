import { z } from "zod";

/**
 * Base entity schema that all entities must extend
 */
export const baseEntitySchema = z.object({
  id: z.string(),
  entityType: z.string(),
  content: z.string(),
  created: z.string().datetime(),
  updated: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Base entity type
 */
export type BaseEntity = z.infer<typeof baseEntitySchema>;

/**
 * Entity input type for creation - allows partial entities with optional system fields
 */
export type EntityInput<T extends BaseEntity> = Omit<
  T,
  "id" | "created" | "updated"
> & {
  id?: string;
  created?: string;
  updated?: string;
};

/**
 * Search result type
 */
export interface SearchResult {
  entity: BaseEntity;
  score: number;
  excerpt: string;
  highlights: string[];
}

/**
 * Interface for entity adapter - handles conversion between entities and markdown
 * following the hybrid storage model
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
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter;

  // Generate frontmatter for markdown
  generateFrontMatter(entity: T): string;
}
