import type { Client } from "@libsql/client";
import {
  createEntityDatabase,
  enableWALModeForEntities,
  ensureEntityIndexes,
  type EntityDB,
} from "./db";
import type {
  EntityDbConfig,
  BaseEntity,
  SearchResult,
  EmbeddingJobData,
  EntityInput,
  SearchOptions,
  EntityService as IEntityService,
} from "./types";
import { EntityRegistry } from "./entityRegistry";
import { Logger, createId, computeContentHash } from "@brains/utils";
import type { IEmbeddingService } from "@brains/embedding-service";
import type { IJobQueueService } from "@brains/job-queue";
import type { MessageBus } from "@brains/messaging-service";
import { EmbeddingJobHandler } from "./handlers/embeddingJobHandler";
import { EntitySearch } from "./entity-search";
import { EntitySerializer } from "./entity-serializer";
import { EntityQueries } from "./entity-queries";
import { ContentResolver, shouldResolveContent } from "./lib/content-resolver";
import { entities } from "./schema/entities";
import { and, eq } from "drizzle-orm";

/**
 * Options for creating an EntityService instance
 */
export interface EntityServiceOptions {
  embeddingService: IEmbeddingService;
  entityRegistry?: EntityRegistry;
  logger?: Logger;
  jobQueueService?: IJobQueueService;
  messageBus?: MessageBus;
  dbConfig: EntityDbConfig;
}

/**
 * EntityService provides CRUD operations for entities
 * Implements Component Interface Standardization pattern
 * Refactored to use separate classes for specific responsibilities
 */
export class EntityService implements IEntityService {
  private static instance: EntityService | null = null;

  private db: EntityDB;
  private dbClient: Client;
  private dbUrl: string;
  private entityRegistry: EntityRegistry;
  private logger: Logger;
  private embeddingService: IEmbeddingService;
  private jobQueueService: IJobQueueService;
  private messageBus?: MessageBus;

  // Extracted responsibility classes
  private entitySearch: EntitySearch;
  private entitySerializer: EntitySerializer;
  private entityQueries: EntityQueries;
  private contentResolver: ContentResolver;

  /**
   * Get the singleton instance of EntityService
   */
  public static getInstance(options: EntityServiceOptions): EntityService {
    EntityService.instance ??= new EntityService(options);
    return EntityService.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    EntityService.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(options: EntityServiceOptions): EntityService {
    return new EntityService(options);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(options: EntityServiceOptions) {
    // Create own database connection
    const { db, client, url } = createEntityDatabase(options.dbConfig);
    this.db = db;
    this.dbClient = client;
    this.dbUrl = url;

    this.embeddingService = options.embeddingService;
    this.entityRegistry =
      options.entityRegistry ??
      EntityRegistry.getInstance(Logger.getInstance());
    this.logger = (options.logger ?? Logger.getInstance()).child(
      "EntityService",
    );
    if (!options.jobQueueService) {
      throw new Error(
        "JobQueueService is required for EntityService initialization",
      );
    }
    this.jobQueueService = options.jobQueueService;
    if (options.messageBus) {
      this.messageBus = options.messageBus;
    }

    // Initialize extracted responsibility classes
    this.entitySerializer = new EntitySerializer(
      this.entityRegistry,
      this.logger,
    );
    this.entityQueries = new EntityQueries(
      this.db,
      this.entitySerializer,
      this.logger,
    );
    this.entitySearch = new EntitySearch(
      this.db,
      this.embeddingService,
      this.entitySerializer,
      this.logger,
    );
    this.contentResolver = new ContentResolver(this.logger);

    // Register embedding job handler with job queue service
    const embeddingJobHandler = EmbeddingJobHandler.createFresh(
      this,
      this.embeddingService,
      this.messageBus,
    );
    this.jobQueueService.registerHandler(
      "shell:embedding",
      embeddingJobHandler,
    );

    // Enable WAL mode and indexes asynchronously (non-blocking)
    this.initializeDatabase().catch((error) => {
      this.logger.warn(
        "Failed to initialize database settings (non-fatal)",
        error,
      );
    });
  }

  /**
   * Initialize the database (WAL mode and indexes)
   */
  private async initializeDatabase(): Promise<void> {
    await enableWALModeForEntities(this.dbClient, this.dbUrl);
    await ensureEntityIndexes(this.dbClient);
  }

  /**
   * Create a new entity (returns immediately, embedding generated in background)
   */
  public async createEntity<T extends BaseEntity>(
    entity: EntityInput<T>,
    options?: {
      priority?: number;
      maxRetries?: number;
      deduplicateId?: boolean;
    },
  ): Promise<{ entityId: string; jobId: string }> {
    this.logger.debug(
      `Creating entity asynchronously of type: ${entity["entityType"]}`,
    );

    // Generate ID, timestamps, and contentHash if not provided
    const now = new Date().toISOString();
    const entityWithDefaults = {
      ...entity,
      id: entity.id ?? createId(),
      created: entity.created ?? now,
      updated: entity.updated ?? now,
      contentHash: computeContentHash(entity.content),
    };

    // Validate entity against its schema
    const validatedEntity = this.entityRegistry.validateEntity<T>(
      entity["entityType"],
      entityWithDefaults,
    );

    // Prepare entity for storage
    const { markdown, metadata } =
      this.entitySerializer.prepareEntityForStorage(
        validatedEntity,
        validatedEntity.entityType,
      );

    // Compute contentHash from the serialized markdown
    const contentHash = computeContentHash(markdown);

    // Resolve final ID (may deduplicate on collision)
    let finalId = validatedEntity.id;
    if (options?.deduplicateId) {
      finalId = await this.resolveUniqueId(
        validatedEntity.id,
        validatedEntity.entityType,
      );
    }

    // Write entity to database immediately (without embedding)
    await this.db.insert(entities).values({
      id: finalId,
      entityType: validatedEntity.entityType,
      content: markdown,
      contentHash,
      metadata,
      created: new Date(validatedEntity.created).getTime(),
      updated: new Date(validatedEntity.updated).getTime(),
    });

    this.logger.debug(
      `Persisted entity ${validatedEntity.entityType}:${finalId} immediately`,
    );

    await this.emitEntityEvent(
      "entity:created",
      validatedEntity.entityType,
      finalId,
      {
        ...validatedEntity,
        id: finalId,
      },
    );

    return this.enqueueEmbeddingJob({
      entityId: finalId,
      entityType: validatedEntity.entityType,
      contentHash,
      operation: "create",
      priority: options?.priority,
      maxRetries: options?.maxRetries,
    });
  }

  /**
   * Find a unique ID by appending -2, -3, etc. if the base ID already exists.
   */
  private async resolveUniqueId(
    baseId: string,
    entityType: string,
  ): Promise<string> {
    // Check if base ID is available
    const existing = await this.db
      .select({ id: entities.id })
      .from(entities)
      .where(and(eq(entities.id, baseId), eq(entities.entityType, entityType)))
      .limit(1);

    if (existing.length === 0) {
      return baseId;
    }

    // Try suffixes -2, -3, ... up to a reasonable limit
    for (let suffix = 2; suffix <= 100; suffix++) {
      const candidateId = `${baseId}-${suffix}`;
      const taken = await this.db
        .select({ id: entities.id })
        .from(entities)
        .where(
          and(
            eq(entities.id, candidateId),
            eq(entities.entityType, entityType),
          ),
        )
        .limit(1);

      if (taken.length === 0) {
        this.logger.debug(`Deduplicated entity ID: ${baseId} → ${candidateId}`);
        return candidateId;
      }
    }

    // Extremely unlikely fallback: append random suffix
    const fallbackId = `${baseId}-${createId().slice(0, 8)}`;
    this.logger.warn(
      `Could not deduplicate entity ID after 100 attempts, using random suffix: ${fallbackId}`,
    );
    return fallbackId;
  }

  /**
   * Get an entity by ID (with content resolution)
   * Resolves entity://image/{id} references to data URLs
   */
  public async getEntity<T extends BaseEntity>(
    entityType: string,
    id: string,
  ): Promise<T | null> {
    const entity = await this.getEntityRaw<T>(entityType, id);
    if (!entity) {
      return null;
    }

    // Resolve content if this entity type supports it
    if (shouldResolveContent(entityType) && entity.content) {
      const result = await this.contentResolver.resolve(entity.content, this);
      if (result.resolvedCount > 0) {
        return { ...entity, content: result.content };
      }
    }

    return entity;
  }

  /**
   * Get an entity by ID (raw, without content resolution)
   * Used internally to avoid recursion when resolving image references
   */
  public async getEntityRaw<T extends BaseEntity>(
    entityType: string,
    id: string,
  ): Promise<T | null> {
    const entityData = await this.entityQueries.getEntityData(entityType, id);
    if (!entityData) {
      return null;
    }

    return this.entitySerializer.convertToEntity<T>(entityData);
  }

  /**
   * Update an existing entity (returns immediately, embedding generated in background)
   */
  public async updateEntity<T extends BaseEntity>(
    entity: T,
    options?: { priority?: number; maxRetries?: number },
  ): Promise<{ entityId: string; jobId: string }> {
    this.logger.debug(
      `Updating entity asynchronously: ${entity.entityType} with ID ${entity.id}`,
    );

    // Update 'updated' timestamp and recompute contentHash
    const updatedEntity = {
      ...entity,
      updated: new Date().toISOString(),
      contentHash: computeContentHash(entity.content),
    };

    // Validate entity against its schema
    const validatedEntity = this.entityRegistry.validateEntity<T>(
      entity.entityType,
      updatedEntity,
    );

    // Prepare entity for storage
    const { markdown, metadata } =
      this.entitySerializer.prepareEntityForStorage(
        validatedEntity,
        validatedEntity.entityType,
      );

    // Compute contentHash from the serialized markdown
    const contentHash = computeContentHash(markdown);

    // Update entity in database immediately
    await this.db
      .update(entities)
      .set({
        content: markdown,
        contentHash,
        metadata,
        updated: new Date(validatedEntity.updated).getTime(),
      })
      .where(
        and(
          eq(entities.id, validatedEntity.id),
          eq(entities.entityType, validatedEntity.entityType),
        ),
      );

    this.logger.debug(
      `Updated entity ${validatedEntity.entityType}:${validatedEntity.id} immediately`,
    );

    await this.emitEntityEvent(
      "entity:updated",
      validatedEntity.entityType,
      validatedEntity.id,
      validatedEntity,
    );

    return this.enqueueEmbeddingJob({
      entityId: validatedEntity.id,
      entityType: validatedEntity.entityType,
      contentHash,
      operation: "update",
      priority: options?.priority,
      maxRetries: options?.maxRetries,
    });
  }

  /**
   * Delete an entity by type and ID
   */
  public async deleteEntity(entityType: string, id: string): Promise<boolean> {
    const deleted = await this.entityQueries.deleteEntity(entityType, id);

    if (deleted) {
      await this.emitEntityEvent("entity:deleted", entityType, id);
    }

    return deleted;
  }

  /**
   * Create or update an entity based on existence
   */
  public async upsertEntity<T extends BaseEntity>(
    entity: T,
    options?: { priority?: number; maxRetries?: number },
  ): Promise<{ entityId: string; jobId: string; created: boolean }> {
    this.logger.debug(
      `Upserting entity of type ${entity.entityType} with ID ${entity.id}`,
    );

    // Check if entity exists
    const existing = await this.getEntity<T>(entity.entityType, entity.id);

    if (existing) {
      // Update existing entity
      const result = await this.updateEntity(entity, options);
      return { ...result, created: false };
    } else {
      // Create new entity
      const result = await this.createEntity(entity, options);
      return { ...result, created: true };
    }
  }

  /**
   * List entities by type with pagination
   */
  public async listEntities<T extends BaseEntity>(
    entityType: string,
    options?: {
      limit?: number;
      offset?: number;
      sortFields?: Array<{ field: string; direction: "asc" | "desc" }>;
      filter?: { metadata?: Record<string, unknown> };
      /** Filter to only entities with metadata.status = "published" */
      publishedOnly?: boolean;
    },
  ): Promise<T[]> {
    return this.entityQueries.listEntities<T>(entityType, options);
  }

  /**
   * Get all registered entity types
   */
  public getEntityTypes(): string[] {
    return this.entityRegistry.getAllEntityTypes();
  }

  /**
   * Check if an entity type is supported
   */
  public hasEntityType(type: string): boolean {
    return this.entityRegistry.hasEntityType(type);
  }

  /**
   * Count entities of a specific type with optional filters
   * Used for database-level pagination
   */
  public async countEntities(
    entityType: string,
    options?: {
      publishedOnly?: boolean;
      filter?: { metadata?: Record<string, unknown> };
    },
  ): Promise<number> {
    return this.entityQueries.countEntities(entityType, options);
  }

  /**
   * Get entity counts grouped by type
   */
  public async getEntityCounts(): Promise<
    Array<{ entityType: string; count: number }>
  > {
    return this.entityQueries.getEntityCounts();
  }

  /**
   * Get weight map for all registered entity types with non-default weights
   */
  public getWeightMap(): Record<string, number> {
    return this.entityRegistry.getWeightMap();
  }

  /**
   * Serialize an entity to markdown format
   */
  public serializeEntity(entity: BaseEntity): string {
    return this.entitySerializer.serializeEntity(entity);
  }

  /**
   * Deserialize markdown content to an entity (partial)
   * Returns parsed fields from markdown - caller should merge with metadata
   */
  public deserializeEntity(
    markdown: string,
    entityType: string,
  ): Partial<BaseEntity> {
    return this.entitySerializer.deserializeEntity(markdown, entityType);
  }

  /**
   * Search entities by query using vector similarity
   */
  public async search<T extends BaseEntity = BaseEntity>(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult<T>[]> {
    return this.entitySearch.search<T>(query, options);
  }

  /**
   * Search entities by type and query
   */
  public async searchEntities(
    entityType: string,
    query: string,
    options?: { limit?: number },
  ): Promise<SearchResult[]> {
    return this.entitySearch.searchEntities(entityType, query, options);
  }

  /**
   * Check async job status
   */
  public async getAsyncJobStatus(jobId: string): Promise<{
    status: "pending" | "processing" | "completed" | "failed";
    error?: string;
  } | null> {
    const status = await this.jobQueueService.getStatus(jobId);

    if (!status) {
      return null;
    }

    return {
      status: status.status,
      ...(status.lastError && { error: status.lastError }),
    };
  }

  /**
   * Store embedding for an entity
   * Used by embedding job handler to store embedding in the embeddings table
   * Entity must already exist in entities table
   */
  public async storeEmbedding(data: {
    entityId: string;
    entityType: string;
    embedding: Float32Array;
    contentHash: string;
  }): Promise<void> {
    const { embeddings } = await import("./schema/embeddings");

    await this.db
      .insert(embeddings)
      .values({
        entityId: data.entityId,
        entityType: data.entityType,
        embedding: data.embedding,
        contentHash: data.contentHash,
      })
      .onConflictDoUpdate({
        target: [embeddings.entityId, embeddings.entityType],
        set: {
          embedding: data.embedding,
          contentHash: data.contentHash,
        },
      });
  }

  /**
   * Broadcast an entity lifecycle event via the message bus
   */
  private async emitEntityEvent(
    event: string,
    entityType: string,
    entityId: string,
    entity?: BaseEntity,
  ): Promise<void> {
    if (!this.messageBus) {
      return;
    }

    this.logger.debug(`Emitting ${event} for ${entityType}:${entityId}`);

    const payload: Record<string, unknown> = { entityType, entityId };
    if (entity) {
      payload["entity"] = entity;
    }

    await this.messageBus.send(
      event,
      payload,
      "entity-service",
      undefined,
      undefined,
      true,
    );
  }

  /**
   * Enqueue an embedding job, or return early if the entity type is non-embeddable
   */
  private async enqueueEmbeddingJob(params: {
    entityId: string;
    entityType: string;
    contentHash: string;
    operation: "create" | "update";
    priority?: number | undefined;
    maxRetries?: number | undefined;
  }): Promise<{ entityId: string; jobId: string }> {
    const {
      entityId,
      entityType,
      contentHash,
      operation,
      priority,
      maxRetries,
    } = params;

    const entityConfig = this.entityRegistry.getEntityTypeConfig(entityType);
    if (entityConfig.embeddable === false) {
      this.logger.debug(
        `Skipping embedding for non-embeddable entity type: ${entityType}:${entityId}`,
      );
      return { entityId, jobId: "" };
    }

    const jobData: EmbeddingJobData = {
      id: entityId,
      entityType,
      contentHash,
      operation,
    };
    const rootJobId = createId();

    const jobId = await this.jobQueueService.enqueue(
      "shell:embedding",
      jobData,
      {
        ...(priority !== undefined && { priority }),
        ...(maxRetries !== undefined && { maxRetries }),
        source: "entity-service",
        rootJobId,
        metadata: {
          operationType: "data_processing" as const,
          operationTarget: entityId,
        },
      },
    );

    this.logger.debug(
      `Queued embedding job for ${entityType}:${entityId} (job: ${jobId})`,
    );

    return { entityId, jobId };
  }
}
