import { z } from "@brains/utils";

/**
 * Entity type without embedding field (used for job queue data)
 */
export interface EntityWithoutEmbedding {
  id: string;
  entityType: string;
  content: string;
  metadata: Record<string, unknown>;
  contentWeight: number;
  created: number;
  updated: number;
}

/**
 * Embedding job data that includes the operation type
 */
export type EmbeddingJobData = EntityWithoutEmbedding & {
  operation: "create" | "update";
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
  metadata: z.record(z.string(), z.unknown()),
});

/**
 * Base entity type - generic to support typed metadata
 * TMetadata defaults to Record<string, unknown> for backward compatibility
 */
export interface BaseEntity<TMetadata = Record<string, unknown>> {
  id: string;
  entityType: string;
  content: string;
  created: string;
  updated: string;
  metadata: TMetadata;
}

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
 *
 * @template TEntity - The full entity type
 * @template TMetadata - The metadata type (defaults to Record<string, unknown>)
 */
export interface EntityAdapter<
  TEntity extends BaseEntity<TMetadata>,
  TMetadata = Record<string, unknown>,
> {
  entityType: string;
  schema: z.ZodSchema<TEntity>;

  // Convert entity to markdown content (may include frontmatter for entity-specific fields)
  toMarkdown(entity: TEntity): string;

  // Extract entity-specific fields from markdown
  // Returns Partial<TEntity> as core fields come from database
  fromMarkdown(markdown: string): Partial<TEntity>;

  // Extract metadata from entity for search/filtering - now strongly typed
  extractMetadata(entity: TEntity): TMetadata;

  // Parse frontmatter metadata from markdown
  parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter;

  // Generate frontmatter for markdown
  generateFrontMatter(entity: TEntity): string;
}

/**
 * List entities options
 * Generic over metadata type for type-safe filtering
 */
export interface ListOptions<TMetadata = Record<string, unknown>> {
  limit?: number;
  offset?: number;
  sortBy?: "created" | "updated";
  sortDirection?: "asc" | "desc";
  filter?: {
    // Typed metadata filter - partial match on metadata fields
    metadata?: Partial<TMetadata>;
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

  // Store entity with pre-generated embedding (used by embedding job handler)
  storeEntityWithEmbedding(data: {
    id: string;
    entityType: string;
    content: string;
    metadata: Record<string, unknown>;
    created: number;
    updated: number;
    contentWeight: number;
    embedding: Float32Array;
  }): Promise<void>;
}

/**
 * Entity Registry interface for managing entity types and their schemas/adapters
 */
export interface EntityRegistry {
  registerEntityType<
    TEntity extends BaseEntity<TMetadata>,
    TMetadata = Record<string, unknown>,
  >(
    type: string,
    schema: z.ZodType<unknown>,
    adapter: EntityAdapter<TEntity, TMetadata>,
  ): void;

  getSchema(type: string): z.ZodType<unknown>;

  getAdapter<
    TEntity extends BaseEntity<TMetadata>,
    TMetadata = Record<string, unknown>,
  >(
    type: string,
  ): EntityAdapter<TEntity, TMetadata>;

  hasEntityType(type: string): boolean;

  validateEntity<TData = unknown>(type: string, entity: unknown): TData;

  getAllEntityTypes(): string[];
}

/**
 * Database configuration for entity service
 */
export interface EntityDbConfig {
  url: string; // Now required - no default
  authToken?: string;
}
