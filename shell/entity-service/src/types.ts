import { z } from "@brains/utils";
import type { DataSource } from "./datasource-types";

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

const canonicalContentVisibilitySchema = z.enum([
  "public",
  "shared",
  "restricted",
]);

export type ContentVisibility = z.infer<
  typeof canonicalContentVisibilitySchema
>;
export type RawContentVisibility = ContentVisibility | "private";

export const contentVisibilitySchema = z
  .union([canonicalContentVisibilitySchema, z.literal("private")])
  .optional()
  .transform((value): ContentVisibility => {
    if (value === undefined) return "public";
    if (value === "private") return "restricted";
    return value;
  });

export function normalizeContentVisibility(
  visibility: RawContentVisibility | undefined,
): ContentVisibility {
  return contentVisibilitySchema.parse(visibility);
}

const visibleContentVisibilitiesByScope: Record<
  ContentVisibility,
  ContentVisibility[]
> = {
  public: ["public"],
  shared: ["public", "shared"],
  restricted: ["public", "shared", "restricted"],
};

export function getVisibleContentVisibilities(
  scope: ContentVisibility,
): ContentVisibility[] {
  return visibleContentVisibilitiesByScope[scope];
}

export function isVisibleWithinScope(
  visibility: ContentVisibility | undefined,
  scope: ContentVisibility,
): boolean {
  return getVisibleContentVisibilities(scope).includes(visibility ?? "public");
}

/**
 * Map a caller's permission level to the content-visibility scope they may see.
 * public  → public         (only public content)
 * trusted → shared         (public + shared)
 * anchor  → restricted     (public + shared + restricted)
 *
 * Defaults to "public" when no permission level is provided, so missing
 * context fails closed.
 */
export function permissionToVisibilityScope(
  level: "anchor" | "trusted" | "public" | undefined,
): ContentVisibility {
  if (level === "anchor") return "restricted";
  if (level === "trusted") return "shared";
  return "public";
}

/**
 * Whether a caller at `level` is allowed to author or update an entity at
 * `visibility`. A user may only write content at a visibility they themselves
 * can read — otherwise they could ghost-write content into a higher trust
 * level than their permission, which is a write-side escalation vector.
 *
 *  public  → may write "public"
 *  trusted → may write "public" | "shared"
 *  anchor  → may write "public" | "shared" | "restricted"
 */
export function canWriteVisibility(
  level: "anchor" | "trusted" | "public" | undefined,
  visibility: ContentVisibility,
): boolean {
  return isVisibleWithinScope(visibility, permissionToVisibilityScope(level));
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
  visibility: contentVisibilitySchema,
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
  visibility: ContentVisibility;
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
  "id" | "created" | "updated" | "contentHash" | "visibility"
> & {
  id?: string;
  created?: string;
  updated?: string;
  visibility?: RawContentVisibility;
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
export interface CreateCoverImageInput {
  generate?: boolean | undefined;
  prompt?: string | undefined;
}

export interface CreateInput {
  entityType: string;
  prompt?: string;
  title?: string;
  content?: string;
  url?: string;
  targetEntityType?: string;
  targetEntityId?: string;
  coverImage?: boolean | CreateCoverImageInput;
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
 * Called before an entity is persisted (on create or update). Throws to reject
 * the write with an operator-facing error. Use this for cross-entity invariants
 * the per-entity Zod schema cannot express.
 */
export type PersistValidator<T extends BaseEntity = BaseEntity> = (
  entity: T,
  context: { operation: "create" | "update" },
) => Promise<void>;

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
  schema: z.ZodType<TEntity, z.ZodTypeDef, unknown>;

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

  /**
   * Optional: build the markdown content and metadata for a queued-generation stub.
   * When undefined, this entity type does not support prompt-based queued creation
   * via system_create; the tool will reject the call rather than silently degrade.
   * The returned metadata must satisfy this entity's metadata schema (with
   * status set to "generating"); central code only stamps id/timestamps/visibility.
   */
  buildStub?(input: { id: string; title: string }): {
    content: string;
    metadata: TMetadata;
  };

  /**
   * Optional: frontmatter fields that may be attached to the stub during the
   * "generating" window (cover images, document attachments — references to
   * other entities). These fields are preserved when the generation job
   * overwrites the stub with final content, since the generator wasn't aware
   * of attachments added after the stub was created.
   */
  stubPreservedFields?: readonly string[];
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
    visibilityScope?: ContentVisibility;
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
  visibilityScope?: ContentVisibility;
  /** Include queued/failed generation stubs in search results (default: false) */
  includeUngenerated?: boolean;
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
  /** Whether this entity type may be used as source material for derived projections (default: true).
   *  Set to false for projection outputs that would create feedback loops. */
  projectionSource?: boolean;
  /** Publish semantics for status-bearing entity types. Statuses listed here
   *  represent publication commitment/execution states and require the
   *  `publish` entity action when entered or modified. */
  publish?: {
    publishStatuses: string[];
  };
}

/**
 * Core entity service interface for read-only operations
 * Used by core plugins that need entity access but shouldn't modify entities
 */
export interface GetEntityRequest {
  entityType: string;
  id: string;
  /**
   * Optional visibility scope. Undefined fails closed to "public" — callers
   * with elevated access must opt up explicitly.
   */
  visibilityScope?: ContentVisibility;
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

export interface CreateEntityRequest<T extends BaseEntity> {
  entity: EntityInput<T>;
  options?: CreateEntityOptions | undefined;
}

export interface CreateEntityFromMarkdownRequest {
  input: CreateEntityFromMarkdownInput;
  options?: CreateEntityOptions | undefined;
}

export interface UpdateEntityRequest<T extends BaseEntity> {
  entity: T;
  options?: EntityJobOptions | undefined;
}

export interface DeleteEntityRequest {
  entityType: string;
  id: string;
}

export interface UpsertEntityRequest<T extends BaseEntity> {
  entity: T;
  options?: EntityJobOptions | undefined;
}

export interface EntitySearchRequest {
  query: string;
  options?: SearchOptions | undefined;
}

export interface SearchWithDistancesRequest {
  query: string;
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
  /**
   * Group counts by entity type. Fails closed: undefined visibilityScope
   * filters to public-only counts so aggregate insights cannot reveal
   * non-public entity existence.
   */
  getEntityCounts(
    visibilityScope?: ContentVisibility,
  ): Promise<Array<{ entityType: string; count: number }>>;

  /** Get configuration for a specific entity type */
  getEntityTypeConfig(type: string): EntityTypeConfig;

  /** Get weight map for all registered entity types with non-default weights */
  getWeightMap(): Record<string, number>;
}

/**
 * Entity service interface for managing brain entities
 */
export interface IEntitiesNamespace {
  /** Register a new entity type with schema and adapter */
  register<TEntity extends BaseEntity>(
    entityType: string,
    schema: z.ZodType<TEntity, z.ZodTypeDef, unknown>,
    adapter: EntityAdapter<TEntity>,
    config?: EntityTypeConfig,
  ): void;

  /**
   * Get the adapter for an entity type.
   *
   * Returns the structural `EntityAdapter<BaseEntity>` view — namespace
   * consumers don't narrow by entity type. For typed access tied to a
   * specific `TEntity`, use the underlying `EntityRegistry.getAdapter<T>`
   * directly (see `entity-serializer.ts`).
   */
  getAdapter(entityType: string): EntityAdapter<BaseEntity> | undefined;

  /** Extend an adapter's frontmatterSchema with additional fields */
  extendFrontmatterSchema(
    type: string,
    extension: z.ZodObject<z.ZodRawShape>,
  ): void;

  /** Get effective frontmatter schema (base + extensions) for an entity type */
  getEffectiveFrontmatterSchema(
    type: string,
  ): z.ZodObject<z.ZodRawShape> | undefined;

  /** Update an existing entity */
  update<TEntity extends BaseEntity>(
    entity: TEntity,
  ): Promise<{ entityId: string; jobId: string }>;

  /** Register a data source for dynamic content */
  registerDataSource(dataSource: DataSource): void;

  /** Register a create interceptor for this plugin's entity type */
  registerCreateInterceptor(
    entityType: string,
    interceptor: CreateInterceptor,
  ): void;
}

export interface EntityService extends ICoreEntityService {
  // Mutations
  createEntity<T extends BaseEntity>(
    request: CreateEntityRequest<T>,
  ): Promise<EntityMutationResult>;
  createEntityFromMarkdown(
    request: CreateEntityFromMarkdownRequest,
  ): Promise<EntityMutationResult>;
  updateEntity<T extends BaseEntity>(
    request: UpdateEntityRequest<T>,
  ): Promise<EntityMutationResult>;
  deleteEntity(request: DeleteEntityRequest): Promise<boolean>;
  upsertEntity<T extends BaseEntity>(
    request: UpsertEntityRequest<T>,
  ): Promise<EntityMutationResult & { created: boolean }>;
  storeEmbedding(data: StoreEmbeddingData): Promise<void>;

  // Serialization
  serializeEntity(entity: BaseEntity): string;
  deserializeEntity(markdown: string, entityType: string): Partial<BaseEntity>;

  // Counts
  countEmbeddings(): Promise<number>;

  // Diagnostics
  searchWithDistances(
    request: SearchWithDistancesRequest,
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

  validateEntity(type: string, entity: unknown): BaseEntity;

  getAllEntityTypes(): string[];

  /** Get configuration for a specific entity type */
  getEntityTypeConfig(type: string): EntityTypeConfig;

  /** Get weight map for all registered entity types with non-default weights */
  getWeightMap(): Record<string, number>;

  registerCreateInterceptor(type: string, interceptor: CreateInterceptor): void;

  getCreateInterceptor(type: string): CreateInterceptor | undefined;

  registerPersistValidator(type: string, validator: PersistValidator): void;

  getPersistValidator(type: string): PersistValidator | undefined;

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
export type { DbConfig as EntityDbConfig } from "@brains/contracts";
