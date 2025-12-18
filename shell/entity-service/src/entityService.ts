import type { Client } from "@libsql/client";
import {
  createEntityDatabase,
  enableWALModeForEntities,
  ensureEntityIndexes,
  type EntityDB,
} from "./db";
import type { EntityDbConfig } from "./types";
import { EntityRegistry } from "./entityRegistry";
import {
  Logger,
  extractIndexedFields,
  createId,
  computeContentHash,
} from "@brains/utils";
import type {
  BaseEntity,
  SearchResult,
  EmbeddingJobData,
  EntityInput,
} from "./types";
import type { IEmbeddingService } from "@brains/embedding-service";
import type { SearchOptions, EntityService as IEntityService } from "./types";
import type { IJobQueueService } from "@brains/job-queue";
import type { MessageBus } from "@brains/messaging-service";
import { EmbeddingJobHandler } from "./handlers/embeddingJobHandler";
import { EntitySearch } from "./entity-search";
import { EntitySerializer } from "./entity-serializer";
import { EntityQueries } from "./entity-queries";

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
      this.entityRegistry,
      this.logger,
    );

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
    options?: { priority?: number; maxRetries?: number },
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

    // Extract content weight from markdown
    const { contentWeight } = extractIndexedFields(
      markdown,
      validatedEntity.id,
    );

    // Prepare entity data for queue (without embedding)
    const entityForQueue: EmbeddingJobData = {
      id: validatedEntity.id,
      entityType: validatedEntity.entityType,
      content: markdown,
      metadata,
      created: new Date(validatedEntity.created).getTime(),
      updated: new Date(validatedEntity.updated).getTime(),
      contentWeight,
      operation: "create",
    };

    // Enqueue for async embedding generation
    const rootJobId = createId(); // Generate unique ID for system job
    const jobId = await this.jobQueueService.enqueue(
      "shell:embedding",
      entityForQueue,
      {
        ...(options?.priority !== undefined && { priority: options.priority }),
        ...(options?.maxRetries !== undefined && {
          maxRetries: options.maxRetries,
        }),
        source: "entity-service",
        rootJobId,
        metadata: {
          operationType: "data_processing" as const,
          operationTarget: validatedEntity.id,
        },
      },
    );

    this.logger.debug(
      `Created entity asynchronously of type ${entity["entityType"]} with ID ${validatedEntity.id}, job ID ${jobId}`,
    );

    // Note: entity:created event will be emitted by EmbeddingJobHandler after entity is saved

    return {
      entityId: validatedEntity.id,
      jobId,
    };
  }

  /**
   * Get an entity by ID
   */
  public async getEntity<T extends BaseEntity>(
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

    // Extract content weight from markdown
    const { contentWeight } = extractIndexedFields(
      markdown,
      validatedEntity.id,
    );

    // Note: Entity will be updated with embedding by the background worker

    // Queue embedding generation for the updated entity
    const rootJobId = createId(); // Generate unique ID for system job
    const entityForQueue: EmbeddingJobData = {
      id: validatedEntity.id,
      entityType: validatedEntity.entityType,
      content: markdown,
      contentWeight,
      created: new Date(validatedEntity.created).getTime(),
      updated: new Date(validatedEntity.updated).getTime(),
      metadata,
      operation: "update",
    };
    const jobId = await this.jobQueueService.enqueue(
      "shell:embedding",
      entityForQueue,
      {
        ...(options?.priority !== undefined && { priority: options.priority }),
        ...(options?.maxRetries !== undefined && {
          maxRetries: options.maxRetries,
        }),
        source: "entity-service",
        rootJobId,
        metadata: {
          operationType: "data_processing" as const,
          operationTarget: validatedEntity.id,
        },
      },
    );

    this.logger.debug(
      `Queued embedding update for entity ${validatedEntity.entityType}:${validatedEntity.id} (job: ${jobId})`,
    );

    // Note: entity:updated event will be emitted by EmbeddingJobHandler after entity is saved

    return {
      entityId: validatedEntity.id,
      jobId,
    };
  }

  /**
   * Delete an entity by type and ID
   */
  public async deleteEntity(entityType: string, id: string): Promise<boolean> {
    const result = await this.entityQueries.deleteEntity(entityType, id);

    // Emit entity:deleted event if deletion was successful
    if (result && this.messageBus) {
      this.logger.debug(
        `Emitting entity:deleted event for ${entityType}:${id}`,
      );
      await this.messageBus.send(
        "entity:deleted",
        {
          entityType,
          entityId: id,
        },
        "entity-service",
        undefined,
        undefined,
        true, // broadcast
      );
    } else if (result && !this.messageBus) {
      this.logger.warn(
        "MessageBus not available, cannot emit entity:deleted event",
      );
    }

    return result;
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
      sortBy?: "created" | "updated";
      sortDirection?: "asc" | "desc";
      filter?: { metadata?: Record<string, unknown> };
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
   * Get entity counts grouped by type
   */
  public async getEntityCounts(): Promise<
    Array<{ entityType: string; count: number }>
  > {
    return this.entityQueries.getEntityCounts();
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
   * Store entity with pre-generated embedding
   * Used by embedding job handler to directly store entity with embedding
   */
  public async storeEntityWithEmbedding(data: {
    id: string;
    entityType: string;
    content: string;
    metadata: Record<string, unknown>;
    created: number;
    updated: number;
    contentWeight: number;
    embedding: Float32Array;
  }): Promise<void> {
    const { entities } = await import("./schema/entities");

    // Compute content hash for change detection
    const contentHash = computeContentHash(data.content);

    await this.db
      .insert(entities)
      .values({
        id: data.id,
        entityType: data.entityType,
        content: data.content,
        contentHash,
        metadata: data.metadata,
        created: data.created,
        updated: data.updated,
        contentWeight: data.contentWeight,
        embedding: data.embedding,
      })
      .onConflictDoUpdate({
        target: [entities.id, entities.entityType],
        set: {
          content: data.content,
          contentHash,
          metadata: data.metadata,
          updated: data.updated,
          contentWeight: data.contentWeight,
          embedding: data.embedding,
        },
      });
  }
}
