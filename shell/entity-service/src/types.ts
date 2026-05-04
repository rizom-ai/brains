import { z } from "@brains/utils";

/**
 * Entity type for unstructured notes (the "base" entity type).
 * Used as a sentinel for the default catch-all markdown file shape —
 * no typed frontmatter schema required, content is the entire file body.
 */
export const BASE_ENTITY_TYPE = "base";

/**
 * Embedding job data - minimal data for job queue
 * Content is NOT stored to avoid large base64 data in job queue
 * (which would end up in dashboard hydration props JSON)
 * Handler fetches fresh content from entity when processing
 */
export interface EmbeddingJobData {
  id: string;
  entityType: string;
  /** Hash of content at job creation time - for staleness detection */
  contentHash: string;
  operation: "create" | "update";
}

/**
 * Options for entity mutation operations (create, update, upsert)
 */
export interface EntityJobOptions {
  priority?: number;
  maxRetries?: number;
}

/**
 * Options for entity creation (extends EntityJobOptions with deduplication)
 */
export interface CreateEntityOptions extends EntityJobOptions {
  deduplicateId?: boolean;
}

/**
 * Result of an entity mutation that triggers an embedding job.
 * When skipped is true, content was unchanged — no DB write, no event, no embedding job.
 */
export interface EntityMutationResult {
  entityId: string;
  jobId: string;
  skipped: boolean;
}

/**
 * Input for adapter-validated direct creation from finalized markdown.
 */
export interface CreateEntityFromMarkdownInput {
  entityType: string;
  id: string;
  markdown: string;
}

/**
 * Data for storing an embedding for an entity
 */
export interface StoreEmbeddingData {
  entityId: string;
  entityType: string;
  embedding: Float32Array;
  contentHash: string;
}

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
  contentHash: z.string(),
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
  /** SHA256 hash of content for change detection */
  contentHash: string;
}

/**
 * Entity input type for creation - allows partial entities with optional system fields
 * contentHash is excluded because it's computed automatically by the entity service
 */
export type EntityInput<T extends BaseEntity> = Omit<
  T,
  "id" | "created" | "updated" | "contentHash"
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
 * Normalized system_create input shape used by plugin create interceptors.
 */
export interface CreateInput {
  entityType: string;
  prompt?: string;
  title?: string;
  content?: string;
  url?: string;
  targetEntityType?: string;
  targetEntityId?: string;
}

/**
 * Minimal caller context forwarded to plugin create interceptors.
 */
export interface CreateExecutionContext {
  interfaceType: string;
  userId: string;
  channelId?: string;
  channelName?: string;
}

/**
 * Result returned to system_create when a plugin fully handles creation.
 */
export type CreateResult =
  | {
      success: true;
      data: { entityId?: string; jobId?: string; status: string };
    }
  | { success: false; error: string };

/**
 * Plugin create interceptors can either fully handle creation,
 * or continue with a rewritten normalized input.
 */
export type CreateInterceptionResult =
  | { kind: "handled"; result: CreateResult }
  | { kind: "continue"; input: CreateInput };

export type CreateInterceptor = (
  input: CreateInput,
  executionContext: CreateExecutionContext,
) => Promise<CreateInterceptionResult>;

/**
 * Minimal event bus contract used by entity-service for lifecycle events.
 * Kept structural to avoid coupling this package to a concrete messaging service.
 */
export interface EntityEventBus {
  send(request: {
    type: string;
    payload: Record<string, unknown>;
    sender: string;
    target?: string;
    metadata?: Record<string, unknown>;
    broadcast?: boolean;
  }): Promise<unknown>;
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

  /** Optional: Zod schema for frontmatter fields. Used by CMS config generation. */
  frontmatterSchema?: z.ZodObject<z.ZodRawShape>;

  /** Optional: Declares this entity type is a singleton (one file, e.g., identity/identity.md). Used by CMS to generate files collection. */
  isSingleton?: boolean;

  /** Optional: Whether this entity has a free-form markdown body below frontmatter. Defaults to true. When false, CMS omits the body widget. */
  hasBody?: boolean;

  /** Returns a markdown body template with section headings for this entity type. Empty string for free-form entities. */
  getBodyTemplate(): string;

  /** Optional: Declares that this entity type supports cover images via coverImageId in frontmatter */
  supportsCoverImage?: boolean;

  /** Optional: Extract coverImageId from entity content/frontmatter */
  getCoverImageId?(entity: TEntity): string | undefined;
}

/**
 * Sort field specification for multi-field sorting
 */
export interface SortField {
  /** Field to sort by - "created", "updated", or a metadata field name */
  field: string;
  /** Sort direction */
  direction: "asc" | "desc";
  /** Sort NULL values before non-NULL values (default: false / SQLite default) */
  nullsFirst?: boolean;
}

/**
 * List entities options
 * Generic over metadata type for type-safe filtering
 */
export interface ListOptions<TMetadata = Record<string, unknown>> {
  limit?: number;
  offset?: number;
  /** Multi-field sorting - supports system fields (created, updated) and metadata fields */
  sortFields?: SortField[];
  filter?: {
    // Typed metadata filter - partial match on metadata fields
    metadata?: Partial<TMetadata>;
  };
  /** Filter to only entities with metadata.status = "published" */
  publishedOnly?: boolean;
}

/**
 * Search options
 */
export interface SearchOptions {
  limit?: number;
  offset?: number;
  types?: string[];
  excludeTypes?: string[];
  sortBy?: "relevance" | "created" | "updated";
  sortDirection?: "asc" | "desc";
  /** Score multipliers per entity type - applied after initial search */
  weight?: Record<string, number>;
}

/**
 * Configuration for entity type registration
 */
export interface EntityTypeConfig {
  /** Score multiplier for search results (default: 1.0) */
  weight?: number;
  /** Whether to generate embeddings for this entity type (default: true).
   *  Set to false for entity types with non-textual content (e.g., images). */
  embeddable?: boolean;
}

/**
 * Core entity service interface for read-only operations
 * Used by core plugins that need entity access but shouldn't modify entities
 */
export interface GetEntityRequest {
  entityType: string;
  id: string;
}

export type GetEntityRawRequest = GetEntityRequest;

export interface ListEntitiesRequest {
  entityType: string;
  options?: ListOptions | undefined;
}

export interface CountEntitiesRequest {
  entityType: string;
  options?: Pick<ListOptions, "publishedOnly" | "filter"> | undefined;
}

export interface DeleteEntityRequest {
  entityType: string;
  id: string;
}

export interface EntitySearchRequest {
  query: string;
  options?: SearchOptions | undefined;
}

export interface ICoreEntityService {
  // Read-only operations
  getEntity<T extends BaseEntity>(request: GetEntityRequest): Promise<T | null>;

  /**
   * Get entity without content resolution (raw)
   * Used internally to avoid recursion when resolving image references
   */
  getEntityRaw<T extends BaseEntity>(
    request: GetEntityRawRequest,
  ): Promise<T | null>;

  listEntities<T extends BaseEntity>(
    request: ListEntitiesRequest,
  ): Promise<T[]>;

  search<T extends BaseEntity = BaseEntity>(
    request: EntitySearchRequest,
  ): Promise<SearchResult<T>[]>;

  // Entity type information
  getEntityTypes(): string[];
  hasEntityType(type: string): boolean;

  // Entity counts
  countEntities(request: CountEntitiesRequest): Promise<number>;
  getEntityCounts(): Promise<Array<{ entityType: string; count: number }>>;

  /** Get weight map for all registered entity types with non-default weights */
  getWeightMap(): Record<string, number>;
}

/**
 * Entity service interface for managing brain entities
 */
export interface EntityService extends ICoreEntityService {
  // Mutations
  createEntity<T extends BaseEntity>(
    entity: EntityInput<T>,
    options?: CreateEntityOptions,
  ): Promise<EntityMutationResult>;
  createEntityFromMarkdown(
    input: CreateEntityFromMarkdownInput,
    options?: CreateEntityOptions,
  ): Promise<EntityMutationResult>;
  updateEntity<T extends BaseEntity>(
    entity: T,
    options?: EntityJobOptions,
  ): Promise<EntityMutationResult>;
  deleteEntity(request: DeleteEntityRequest): Promise<boolean>;
  upsertEntity<T extends BaseEntity>(
    entity: T,
    options?: EntityJobOptions,
  ): Promise<EntityMutationResult & { created: boolean }>;
  storeEmbedding(data: StoreEmbeddingData): Promise<void>;

  // Serialization
  serializeEntity(entity: BaseEntity): string;
  deserializeEntity(markdown: string, entityType: string): Partial<BaseEntity>;

  // Counts
  countEmbeddings(): Promise<number>;

  // Diagnostics
  searchWithDistances(
    query: string,
  ): Promise<Array<{ entityId: string; entityType: string; distance: number }>>;

  // Lifecycle
  initialize(): Promise<void>;

  // Job status
  getAsyncJobStatus(jobId: string): Promise<{
    status: "pending" | "processing" | "completed" | "failed";
    error?: string;
  } | null>;
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
    config?: EntityTypeConfig,
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

  /** Get configuration for a specific entity type */
  getEntityTypeConfig(type: string): EntityTypeConfig;

  /** Get weight map for all registered entity types with non-default weights */
  getWeightMap(): Record<string, number>;

  registerCreateInterceptor(type: string, interceptor: CreateInterceptor): void;

  getCreateInterceptor(type: string): CreateInterceptor | undefined;

  /**
   * Extend an adapter's frontmatterSchema with additional fields.
   * Used by plugins to add domain-specific fields (e.g., professional-site adds tagline to profile).
   * Extensions are merged into the effective schema returned by getEffectiveFrontmatterSchema().
   */
  extendFrontmatterSchema(
    type: string,
    extension: z.ZodObject<z.ZodRawShape>,
  ): void;

  /**
   * Get the effective frontmatter schema for an entity type,
   * with all registered extensions merged in.
   * Returns undefined if the adapter has no frontmatterSchema.
   */
  getEffectiveFrontmatterSchema(
    type: string,
  ): z.ZodObject<z.ZodRawShape> | undefined;
}

/**
 * Database configuration for entity service
 */
export type { DbConfig as EntityDbConfig } from "@brains/utils";
