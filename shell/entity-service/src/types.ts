import { z } from "@brains/utils";
import type { Entity } from "./schema/entities";

/**
 * Entity type without embedding field (used for job queue data)
 */
export type EntityWithoutEmbedding = Omit<Entity, "embedding">;

/**
 * Embedding job data that includes the operation type
 */
export type EmbeddingJobData = EntityWithoutEmbedding & {
  operation: 'create' | 'update';
};

/**
 * Base entity schema that all entities must extend
 */
export const baseEntitySchema = z.object({
  id: z.string(),
  entityType: z.string(),
  content: z.string(),
  created: z.string().datetime(),
  updated: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
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
export interface SearchResult<T extends BaseEntity = BaseEntity> {
  entity: T;
  score: number;
  excerpt: string;
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

/**
 * List entities options
 */
export interface ListOptions {
  limit?: number;
  offset?: number;
  sortBy?: "created" | "updated";
  sortDirection?: "asc" | "desc";
  filter?: {
    // Flexible metadata filter - can query any frontmatter field
    metadata?: Record<string, unknown>;
  };
}

/**
 * Search options
 */
export interface SearchOptions {
  limit?: number;
  offset?: number;
  types?: string[];
  sortBy?: "relevance" | "created" | "updated";
  sortDirection?: "asc" | "desc";
}

/**
 * Core entity service interface for read-only operations
 * Used by core plugins that need entity access but shouldn't modify entities
 */
export interface ICoreEntityService {
  // Read-only operations
  getEntity<T extends BaseEntity>(
    entityType: string,
    id: string,
  ): Promise<T | null>;

  listEntities<T extends BaseEntity>(
    type: string,
    options?: ListOptions,
  ): Promise<T[]>;

  search<T extends BaseEntity = BaseEntity>(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult<T>[]>;

  // Entity type information
  getEntityTypes(): string[];
  hasEntityType(type: string): boolean;
}

/**
 * Entity service interface for managing brain entities
 */
export interface EntityService extends ICoreEntityService {
  // Core entity operations
  getEntity<T extends BaseEntity>(
    entityType: string,
    id: string,
  ): Promise<T | null>;
  createEntity<T extends BaseEntity>(
    entity: EntityInput<T>,
    options?: { priority?: number; maxRetries?: number },
  ): Promise<{ entityId: string; jobId: string }>;
  updateEntity<T extends BaseEntity>(
    entity: T,
    options?: { priority?: number; maxRetries?: number },
  ): Promise<{ entityId: string; jobId: string }>;
  deleteEntity(entityType: string, id: string): Promise<boolean>;
  upsertEntity<T extends BaseEntity>(
    entity: T,
    options?: { priority?: number; maxRetries?: number },
  ): Promise<{ entityId: string; jobId: string; created: boolean }>;

  // Query operations
  listEntities<T extends BaseEntity>(
    type: string,
    options?: ListOptions,
  ): Promise<T[]>;
  search<T extends BaseEntity = BaseEntity>(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult<T>[]>;

  // Entity type information
  getEntityTypes(): string[];
  hasEntityType(type: string): boolean;

  // Serialization operations
  serializeEntity(entity: BaseEntity): string;
  deserializeEntity(markdown: string, entityType: string): Partial<BaseEntity>;

  // Check async job status
  getAsyncJobStatus(jobId: string): Promise<{
    status: "pending" | "processing" | "completed" | "failed";
    error?: string;
  } | null>;
}

/**
 * Entity Registry interface for managing entity types and their schemas/adapters
 */
export interface EntityRegistry {
  registerEntityType<TEntity extends BaseEntity>(
    type: string,
    schema: z.ZodType<unknown>,
    adapter: EntityAdapter<TEntity>,
  ): void;

  getSchema(type: string): z.ZodType<unknown>;

  getAdapter<T extends BaseEntity>(type: string): EntityAdapter<T>;

  hasEntityType(type: string): boolean;

  validateEntity<TData = unknown>(type: string, entity: unknown): TData;

  getAllEntityTypes(): string[];
}
