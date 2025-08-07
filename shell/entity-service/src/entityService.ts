import type { Client } from "@libsql/client";
import { createEntityDatabase, enableWALModeForEntities, ensureEntityIndexes, type EntityDB, type EntityDbConfig } from "./db";
import { entities } from "./schema/entities";
import { createId } from "./schema/utils";
import { EntityRegistry } from "./entityRegistry";
import { Logger, extractIndexedFields } from "@brains/utils";
import type { BaseEntity, SearchResult, EntityWithoutEmbedding } from "./types";
import type { IEmbeddingService } from "@brains/embedding-service";
import type { SearchOptions, EntityService as IEntityService } from "./types";
import { eq, and, inArray, desc, asc, sql } from "drizzle-orm";
import { z } from "zod";
import type { JobQueueService } from "@brains/job-queue";
import { EmbeddingJobHandler } from "./handlers/embeddingJobHandler";

/**
 * Schema for list entities options
 */
const listOptionsSchema = z.object({
  limit: z.number().int().positive().optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
  sortBy: z.enum(["created", "updated"]).optional().default("updated"),
  sortDirection: z.enum(["asc", "desc"]).optional().default("desc"),
  filter: z
    .object({
      metadata: z.record(z.unknown()).optional(),
    })
    .optional(),
});

type ListOptions = z.input<typeof listOptionsSchema>;

/**
 * Schema for search options (excluding tags)
 */
const searchOptionsSchema = z.object({
  limit: z.number().int().positive().optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
  types: z.array(z.string()).optional().default([]),
  excludeTypes: z.array(z.string()).optional().default([]),
});

/**
 * Options for creating an EntityService instance
 */
export interface EntityServiceOptions {
  embeddingService: IEmbeddingService;
  entityRegistry?: EntityRegistry;
  logger?: Logger;
  jobQueueService?: JobQueueService;
  dbConfig?: EntityDbConfig;
}

/**
 * EntityService provides CRUD operations for entities
 * Implements Component Interface Standardization pattern
 */
export class EntityService implements IEntityService {
  private static instance: EntityService | null = null;

  private db: EntityDB;
  private dbClient: Client;
  private dbUrl: string;
  private entityRegistry: EntityRegistry;
  private logger: Logger;
  private embeddingService: IEmbeddingService;
  private jobQueueService: JobQueueService;

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
    
    // Register embedding job handler with job queue service
    const embeddingJobHandler = EmbeddingJobHandler.createFresh(
      this.db,
      this.embeddingService,
    );
    this.jobQueueService.registerHandler("embedding", embeddingJobHandler);
    
    // Enable WAL mode and indexes asynchronously (non-blocking)
    this.initializeDatabase().catch((error) => {
      this.logger.warn("Failed to initialize database settings (non-fatal)", error);
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
    entity: Omit<T, "id" | "created" | "updated"> & {
      id?: string;
      created?: string;
      updated?: string;
    },
    options?: { priority?: number; maxRetries?: number },
  ): Promise<{ entityId: string; jobId: string }> {
    this.logger.debug(
      `Creating entity asynchronously of type: ${entity["entityType"]}`,
    );

    // Generate ID and timestamps if not provided
    const now = new Date().toISOString();
    const entityWithDefaults = {
      ...entity,
      id: entity.id ?? createId(),
      created: entity.created ?? now,
      updated: entity.updated ?? now,
    };

    // Validate entity against its schema
    const validatedEntity = this.entityRegistry.validateEntity<T>(
      entity["entityType"],
      entityWithDefaults,
    );

    // Convert to markdown using adapter
    const adapter = this.entityRegistry.getAdapter<T>(
      validatedEntity.entityType,
    );
    const markdown = adapter.toMarkdown(validatedEntity);

    // Extract metadata using adapter
    const metadata = adapter.extractMetadata(validatedEntity);

    // Extract content weight from markdown
    const { contentWeight } = extractIndexedFields(
      markdown,
      validatedEntity.id,
    );

    // Prepare entity data for queue (without embedding)
    const entityForQueue: EntityWithoutEmbedding = {
      id: validatedEntity.id,
      entityType: validatedEntity.entityType,
      content: markdown,
      metadata,
      created: new Date(validatedEntity.created).getTime(),
      updated: new Date(validatedEntity.updated).getTime(),
      contentWeight,
    };

    // Enqueue for async embedding generation
    // EntityService operations use system defaults for metadata
    const defaultMetadata = {
      interfaceId: "system",
      userId: "system",
      operationType: "embedding_generation" as const,
    };

    const jobId = await this.jobQueueService.enqueue(
      "embedding",
      entityForQueue,
      {
        ...(options?.priority !== undefined && { priority: options.priority }),
        ...(options?.maxRetries !== undefined && {
          maxRetries: options.maxRetries,
        }),
        source: "entity-service",
        metadata: {
          ...defaultMetadata,
          operationTarget: validatedEntity.id,
        },
      },
    );

    this.logger.debug(
      `Created entity asynchronously of type ${entity["entityType"]} with ID ${validatedEntity.id}, job ID ${jobId}`,
    );

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
    this.logger.debug(`Getting entity of type ${entityType} with ID ${id}`);

    // Query database
    const result = await this.db
      .select()
      .from(entities)
      .where(and(eq(entities.id, id), eq(entities.entityType, entityType)))
      .limit(1);

    if (result.length === 0) {
      this.logger.info(`Entity of type ${entityType} with ID ${id} not found`);
      return null;
    }

    const entityData = result[0];
    if (!entityData) {
      return null;
    }

    // Convert from markdown to entity using hybrid storage model
    try {
      const adapter = this.entityRegistry.getAdapter<T>(entityType);

      // Extract entity-specific fields from markdown
      const parsedContent = adapter.fromMarkdown(entityData.content);

      // Merge database fields with parsed content and metadata
      const entity = {
        // Core fields from database (always authoritative)
        id: entityData.id,
        entityType: entityData.entityType,
        content: entityData.content,
        created: new Date(entityData.created).toISOString(),
        updated: new Date(entityData.updated).toISOString(),

        // Fields from metadata (includes title, tags, entity-specific fields)
        ...entityData.metadata,

        // Entity-specific fields from adapter (override metadata if needed)
        ...parsedContent,
      } as T;

      // Validate the complete entity
      return await this.entityRegistry.validateEntity(entityType, entity);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to parse entity of type ${entityType} with ID ${id}: ${errorMessage}`,
      );
      return null;
    }
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

    // Update 'updated' timestamp
    const updatedEntity = {
      ...entity,
      updated: new Date().toISOString(),
    };

    // Validate entity against its schema
    const validatedEntity = this.entityRegistry.validateEntity<T>(
      entity.entityType,
      updatedEntity,
    );

    // Convert to markdown using adapter
    const adapter = this.entityRegistry.getAdapter<T>(
      validatedEntity.entityType,
    );
    const markdown = adapter.toMarkdown(validatedEntity);

    // Extract metadata using adapter
    const metadata = adapter.extractMetadata(validatedEntity);

    // Extract content weight from markdown
    const { contentWeight } = extractIndexedFields(
      markdown,
      validatedEntity.id,
    );

    // Note: Entity will be updated with embedding by the background worker

    // Queue embedding generation for the updated entity
    // EntityService operations use system defaults for metadata
    const defaultMetadata = {
      interfaceId: "system",
      userId: "system",
      operationType: "embedding_generation" as const,
    };

    const jobId = await this.jobQueueService.enqueue(
      "embedding",
      {
        id: validatedEntity.id,
        entityType: validatedEntity.entityType,
        content: markdown,
        contentWeight,
        created: new Date(validatedEntity.created).getTime(),
        updated: new Date(validatedEntity.updated).getTime(),
        metadata,
      },
      {
        ...(options?.priority !== undefined && { priority: options.priority }),
        ...(options?.maxRetries !== undefined && {
          maxRetries: options.maxRetries,
        }),
        source: "entity-service",
        metadata: {
          ...defaultMetadata,
          operationTarget: validatedEntity.id,
        },
      },
    );

    this.logger.info(
      `Queued embedding update for entity ${validatedEntity.entityType}:${validatedEntity.id} (job: ${jobId})`,
    );

    return {
      entityId: validatedEntity.id,
      jobId,
    };
  }

  /**
   * Delete an entity by type and ID
   */
  public async deleteEntity(entityType: string, id: string): Promise<boolean> {
    this.logger.debug(`Deleting entity of type ${entityType} with ID ${id}`);

    // First check if entity exists
    const existingEntity = await this.db
      .select({ id: entities.id })
      .from(entities)
      .where(and(eq(entities.entityType, entityType), eq(entities.id, id)))
      .limit(1);

    if (existingEntity.length === 0) {
      this.logger.info(
        `Entity of type ${entityType} with ID ${id} not found for deletion`,
      );
      return false;
    }

    // Delete from database (cascades to chunks and embeddings)
    await this.db
      .delete(entities)
      .where(and(eq(entities.entityType, entityType), eq(entities.id, id)));

    this.logger.info(`Deleted entity of type ${entityType} with ID ${id}`);
    return true;
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
    options: ListOptions = {},
  ): Promise<T[]> {
    const validatedOptions = listOptionsSchema.parse(options);
    const { limit, offset, sortBy, sortDirection, filter } = validatedOptions;

    this.logger.debug(
      `Listing entities of type ${entityType} (limit: ${limit}, offset: ${offset}, filter: ${JSON.stringify(filter)})`,
    );

    // Build where conditions
    const whereConditions = [eq(entities.entityType, entityType)];

    // Handle metadata filters
    if (filter?.metadata) {
      // For each metadata filter, add a JSON query condition
      for (const [key, value] of Object.entries(filter.metadata)) {
        if (value !== undefined) {
          // SQLite JSON query: json_extract(metadata, '$.key') = value
          const jsonPath = `$.${key}`;
          whereConditions.push(
            sql`json_extract(${entities.metadata}, ${jsonPath}) = ${value}`,
          );
        }
      }
    }

    // Query database
    const query = this.db
      .select()
      .from(entities)
      .where(and(...whereConditions))
      .limit(limit)
      .offset(offset)
      .orderBy(
        sortDirection === "desc"
          ? desc(sortBy === "created" ? entities.created : entities.updated)
          : asc(sortBy === "created" ? entities.created : entities.updated),
      );

    const result = await query;

    // Convert from markdown to entities
    const entityList: T[] = [];
    const adapter = this.entityRegistry.getAdapter<T>(entityType);

    for (const entityData of result) {
      try {
        // Extract entity-specific fields from markdown
        const parsedContent = adapter.fromMarkdown(entityData.content);

        // Merge database fields with parsed content and metadata
        const entity = {
          // Core fields from database
          id: entityData.id,
          entityType: entityData.entityType,
          content: entityData.content,
          created: new Date(entityData.created).toISOString(),
          updated: new Date(entityData.updated).toISOString(),

          // Fields from metadata (includes title, tags, entity-specific fields)
          ...entityData.metadata,

          // Entity-specific fields from adapter (override metadata if needed)
          ...parsedContent,
        } as T;

        // Validate and add to list
        const validatedEntity = this.entityRegistry.validateEntity<T>(
          entityType,
          entity,
        );
        entityList.push(validatedEntity);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to parse entity of type ${entityType} with ID ${entityData.id}: ${errorMessage}`,
        );
        // Skip invalid entities and continue
      }
    }

    this.logger.info(
      `Listed ${entityList.length} entities of type ${entityType}`,
    );

    return entityList;
  }

  /**
   * Get supported entity types from registry
   */
  public getSupportedEntityTypes(): string[] {
    return this.entityRegistry.getAllEntityTypes();
  }

  /**
   * Get all entity types (alias for getSupportedEntityTypes)
   */
  public getAllEntityTypes(): string[] {
    return this.getSupportedEntityTypes();
  }

  /**
   * Get entity types (alias for getSupportedEntityTypes)
   */
  public getEntityTypes(): string[] {
    return this.getSupportedEntityTypes();
  }

  /**
   * Check if an entity type is supported
   */
  public hasEntityType(type: string): boolean {
    return this.entityRegistry.hasEntityType(type);
  }

  /**
   * Serialize an entity to markdown format
   */
  public serializeEntity(entity: BaseEntity): string {
    const adapter = this.entityRegistry.getAdapter(entity.entityType);
    return adapter.toMarkdown(entity);
  }

  /**
   * Deserialize markdown content to an entity (partial)
   * Returns parsed fields from markdown - caller should merge with metadata
   */
  public deserializeEntity(
    markdown: string,
    entityType: string,
  ): Partial<BaseEntity> {
    const adapter = this.entityRegistry.getAdapter(entityType);
    return adapter.fromMarkdown(markdown);
  }

  /**
   * Search entities by query using vector similarity
   */
  public async search(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    const validatedOptions = searchOptionsSchema.parse(options ?? {});
    const { limit, offset, types, excludeTypes } = validatedOptions;

    this.logger.debug(`Searching entities with query: "${query}"`);

    // Generate embedding for the query
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);

    // Convert Float32Array to JSON array for SQL
    const embeddingArray = Array.from(queryEmbedding);

    // Build the base select
    const baseSelect = {
      id: entities.id,
      entityType: entities.entityType,
      content: entities.content,
      created: entities.created,
      updated: entities.updated,
      metadata: entities.metadata,
      // Calculate cosine distance (0 = identical, 1 = orthogonal, 2 = opposite)
      distance:
        sql<number>`vector_distance_cos(${entities.embedding}, vector32(${JSON.stringify(embeddingArray)}))`.as(
          "distance",
        ),
    };

    // Build where conditions
    const whereConditions = [
      sql`vector_distance_cos(${entities.embedding}, vector32(${JSON.stringify(embeddingArray)})) < 1.0`,
    ];

    // Add type filter if specified
    if (types.length > 0) {
      whereConditions.push(inArray(entities.entityType, types));
    }

    // Add exclude types filter if specified
    if (excludeTypes.length > 0) {
      whereConditions.push(
        sql`${entities.entityType} NOT IN (${sql.join(
          excludeTypes.map((t) => sql`${t}`),
          sql`, `,
        )})`,
      );
    }

    const results = await this.db
      .select(baseSelect)
      .from(entities)
      .where(and(...whereConditions))
      .orderBy(sql`distance`)
      .limit(limit)
      .offset(offset);

    // Transform results into SearchResult format
    const searchResults: SearchResult[] = [];

    for (const row of results) {
      try {
        const adapter = this.entityRegistry.getAdapter(row.entityType);
        const parsedContent = adapter.fromMarkdown(row.content);

        const metadata = row.metadata as Record<string, unknown>;
        const entity = this.entityRegistry.validateEntity<BaseEntity>(
          row.entityType,
          {
            id: row.id,
            entityType: row.entityType,
            content: row.content,
            created: new Date(row.created).toISOString(),
            updated: new Date(row.updated).toISOString(),
            ...metadata,
            ...parsedContent,
          },
        );

        // Convert distance to similarity score (1 - distance/2 to normalize to 0-1 range)
        const score = 1 - row.distance / 2;

        // Create a more readable excerpt
        const excerpt = this.createExcerpt(row.content, query);

        searchResults.push({
          entity,
          score,
          excerpt,
        });
      } catch (error) {
        this.logger.error(`Failed to parse entity during search: ${error}`);
        // Skip this result
      }
    }

    // Log search results count without exposing the full query
    const queryPreview =
      query.length > 50 ? query.substring(0, 50) + "..." : query;
    this.logger.debug(
      `Found ${searchResults.length} results for query "${queryPreview}"`,
    );

    return searchResults;
  }

  /**
   * Create an excerpt from content based on query
   */
  private createExcerpt(content: string, query: string): string {
    const maxLength = 200;
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();

    // Find the position of the query in the content
    const position = contentLower.indexOf(queryLower);

    if (position !== -1) {
      // Extract text around the query
      const start = Math.max(0, position - 50);
      const end = Math.min(content.length, position + queryLower.length + 50);
      let excerpt = content.slice(start, end);

      // Add ellipsis if needed
      if (start > 0) excerpt = "..." + excerpt;
      if (end < content.length) excerpt = excerpt + "...";

      return excerpt;
    }

    // If query not found, return beginning of content
    return (
      content.slice(0, maxLength) + (content.length > maxLength ? "..." : "")
    );
  }

  /**
   * Search entities by type and query
   */
  public async searchEntities(
    entityType: string,
    query: string,
    options?: { limit?: number },
  ): Promise<SearchResult[]> {
    // Build search options with the entity type filter
    const searchOptions: SearchOptions = {
      types: [entityType],
      limit: options?.limit ?? 20,
      offset: 0,
      sortBy: "relevance",
      sortDirection: "desc",
    };

    return this.search(query, searchOptions);
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
}
