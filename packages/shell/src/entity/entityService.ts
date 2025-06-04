import type { DrizzleDB } from "@brains/db";
import { entities, createId } from "@brains/db/schema";
import { EntityRegistry } from "./entityRegistry";
import type { EntityAdapter } from "./entityRegistry";
import { Logger, extractIndexedFields } from "@brains/utils";
import type { IEmbeddingService } from "../embedding/embeddingService";
import type { BaseEntity, SearchResult } from "@brains/types";
import type { SearchOptions } from "../types";
import { eq, and, inArray, desc, asc, sql } from "drizzle-orm";
import { z } from "zod";

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
});

/**
 * Options for creating an EntityService instance
 */
export interface EntityServiceOptions {
  db: DrizzleDB;
  embeddingService: IEmbeddingService;
  entityRegistry?: EntityRegistry;
  logger?: Logger;
}

/**
 * EntityService provides CRUD operations for entities
 * Implements Component Interface Standardization pattern
 */
export class EntityService {
  private static instance: EntityService | null = null;

  private db: DrizzleDB;
  private entityRegistry: EntityRegistry;
  private logger: Logger;
  private embeddingService: IEmbeddingService;

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
    this.db = options.db;
    this.embeddingService = options.embeddingService;
    this.entityRegistry =
      options.entityRegistry ??
      EntityRegistry.getInstance(Logger.getInstance());
    this.logger = (options.logger ?? Logger.getInstance()).child(
      "EntityService",
    );
  }

  /**
   * Create a new entity
   */
  public async createEntity<T extends BaseEntity>(
    entity: Omit<T, "id" | "created" | "updated"> & {
      id?: string;
      created?: string;
      updated?: string;
    },
  ): Promise<T> {
    this.logger.debug(`Creating entity of type: ${entity["entityType"]}`);

    // Generate ID and timestamps if not provided
    const now = new Date().toISOString();
    const entityWithDefaults = {
      ...entity,
      id: entity.id ?? createId(),
      created: entity.created ?? now,
      updated: entity.updated ?? now,
    } as T;

    this.logger.debug("Creating entity with timestamps", {
      provided: { created: entity.created, updated: entity.updated },
      using: {
        created: entityWithDefaults.created,
        updated: entityWithDefaults.updated,
      },
    });

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

    // Generate embedding synchronously
    const embedding = await this.embeddingService.generateEmbedding(markdown);

    // Store in database
    await this.db.insert(entities).values({
      id: validatedEntity.id,
      entityType: validatedEntity.entityType,
      content: markdown,
      metadata,
      created: new Date(validatedEntity.created).getTime(),
      updated: new Date(validatedEntity.updated).getTime(),
      contentWeight,
      embedding,
    });

    this.logger.info(
      `Created entity of type ${entity["entityType"]} with ID ${validatedEntity.id}`,
    );

    return validatedEntity;
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
        created: new Date(entityData.created).toISOString(),
        updated: new Date(entityData.updated).toISOString(),

        // Fields from metadata (includes title, tags, entity-specific fields)
        ...entityData.metadata,

        // Entity-specific fields from adapter (override metadata if needed)
        ...parsedContent,
      } as T;

      // Validate the complete entity
      return await Promise.resolve(
        this.entityRegistry.validateEntity(entityType, entity),
      );
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
   * Update an existing entity
   */
  public async updateEntity<T extends BaseEntity>(entity: T): Promise<T> {
    this.logger.debug(
      `Updating entity of type ${entity.entityType} with ID ${entity.id}`,
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

    // Generate new embedding
    const embedding = await this.embeddingService.generateEmbedding(markdown);

    // Update in database
    await this.db
      .update(entities)
      .set({
        content: markdown,
        metadata,
        updated: new Date(validatedEntity.updated).getTime(),
        contentWeight,
        embedding,
      })
      .where(eq(entities.id, validatedEntity.id));

    this.logger.info(
      `Updated entity of type ${entity.entityType} with ID ${validatedEntity.id}`,
    );

    return validatedEntity;
  }

  /**
   * Delete an entity by ID
   */
  public async deleteEntity(id: string): Promise<boolean> {
    this.logger.debug(`Deleting entity with ID ${id}`);

    // First check if entity exists
    const existingEntity = await this.db
      .select({ id: entities.id })
      .from(entities)
      .where(eq(entities.id, id))
      .limit(1);

    if (existingEntity.length === 0) {
      this.logger.info(`Entity with ID ${id} not found for deletion`);
      return false;
    }

    // Delete from database (cascades to chunks and embeddings)
    await this.db.delete(entities).where(eq(entities.id, id));

    this.logger.info(`Deleted entity with ID ${id}`);
    return true;
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
   * Get adapter for a specific entity type
   */
  public getAdapter<T extends BaseEntity>(
    entityType: string,
  ): EntityAdapter<T> {
    return this.entityRegistry.getAdapter<T>(entityType);
  }

  /**
   * Search entities by query using vector similarity
   */
  public async search(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    const validatedOptions = searchOptionsSchema.parse(options ?? {});
    const { limit, offset, types } = validatedOptions;

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

    // Build the query with type filter if specified
    const whereCondition =
      types.length > 0
        ? and(
            sql`vector_distance_cos(${entities.embedding}, vector32(${JSON.stringify(embeddingArray)})) < 1.0`,
            inArray(entities.entityType, types),
          )
        : sql`vector_distance_cos(${entities.embedding}, vector32(${JSON.stringify(embeddingArray)})) < 1.0`;

    const results = await this.db
      .select(baseSelect)
      .from(entities)
      .where(whereCondition)
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
          highlights: [], // TODO: Implement highlight extraction
        });
      } catch (error) {
        this.logger.error(`Failed to parse entity during search: ${error}`);
        // Skip this result
      }
    }

    this.logger.info(
      `Found ${searchResults.length} results for query "${query}"`,
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
   * Check if adapter exists for entity type
   */
  public hasAdapter(entityType: string): boolean {
    try {
      this.entityRegistry.getAdapter(entityType);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Import raw entity data (e.g., from git sync)
   * Creates a BaseEntity from file system data and passes to create/update
   */
  public async importRawEntity(data: {
    entityType: string;
    id: string;
    content: string;
    created: Date;
    updated: Date;
  }): Promise<void> {
    // Check if entity exists
    const existing = await this.getEntity(data.entityType, data.id);

    if (existing) {
      // Update if modified (compare timestamps)
      const existingTime = new Date(existing.updated).getTime();
      const newTime = data.updated.getTime();
      if (existingTime < newTime) {
        // Build entity for update, preserving any entity-specific fields
        const entity: BaseEntity = {
          ...existing,
          id: data.id,
          entityType: data.entityType,
          content: data.content,
          updated: data.updated.toISOString(),
        };
        await this.updateEntity(entity);
      }
    } else {
      // Create new entity with timestamps
      await this.createEntity({
        id: data.id,
        entityType: data.entityType,
        content: data.content,
        created: data.created.toISOString(),
        updated: data.updated.toISOString(),
      });
    }
  }
}
