import type { DrizzleDB } from "../db";
import { entities, createId, selectEntitySchema } from "../db/schema";
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
});

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
    if (!EntityService.instance) {
      EntityService.instance = new EntityService(options);
    }
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
    entity: Omit<T, "id"> & { id?: string },
  ): Promise<T> {
    this.logger.debug(`Creating entity of type: ${entity["entityType"]}`);

    // Generate ID if not provided
    const entityWithId = {
      ...entity,
      id: entity.id ?? createId(),
    } as T;

    // Validate entity against its schema
    const validatedEntity = this.entityRegistry.validateEntity<T>(
      entity["entityType"],
      entityWithId,
    );

    // Convert to markdown using adapter
    const adapter = this.entityRegistry.getAdapter<T>(
      validatedEntity.entityType,
    );
    const markdown = adapter.toMarkdown(validatedEntity);

    // Extract content weight from markdown (but keep original title and tags)
    const { contentWeight } = extractIndexedFields(
      markdown,
      validatedEntity.id,
    );

    // Use the entity's actual title and tags, not extracted ones
    const title = validatedEntity.title;
    const tags = validatedEntity.tags;

    // Generate embedding synchronously
    const embedding = await this.embeddingService.generateEmbedding(markdown);

    // Store in database
    await this.db.insert(entities).values({
      id: validatedEntity.id,
      entityType: validatedEntity.entityType,
      title, // Use extracted title
      content: markdown,
      created: new Date(validatedEntity.created).getTime(),
      updated: new Date(validatedEntity.updated).getTime(),
      tags, // Use extracted tags
      contentWeight, // Use extracted contentWeight
      embedding, // Always present with local generation
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

      // Merge database fields with parsed content
      const entity = {
        // Core fields from database (always authoritative)
        id: entityData.id,
        entityType: entityData.entityType,
        title: entityData.title,
        created: new Date(entityData.created).toISOString(),
        updated: new Date(entityData.updated).toISOString(),
        tags: entityData.tags,

        // Entity-specific fields from adapter
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

    // Extract content weight from markdown (but keep original title and tags)
    const { contentWeight } = extractIndexedFields(
      markdown,
      validatedEntity.id,
    );

    // Use the entity's actual title and tags, not extracted ones
    const title = validatedEntity.title;
    const tags = validatedEntity.tags;

    // Generate new embedding
    const embedding = await this.embeddingService.generateEmbedding(markdown);

    // Update in database
    await this.db
      .update(entities)
      .set({
        title, // Use extracted title
        content: markdown,
        updated: new Date(validatedEntity.updated).getTime(),
        tags, // Use extracted tags
        contentWeight, // Use extracted contentWeight
        embedding, // Update embedding
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
    options: {
      limit?: number;
      offset?: number;
      sortBy?: "created" | "updated";
      sortDirection?: "asc" | "desc";
    } = {},
  ): Promise<T[]> {
    const validatedOptions = listOptionsSchema.parse(options);
    const { limit, offset, sortBy, sortDirection } = validatedOptions;

    this.logger.debug(
      `Listing entities of type ${entityType} (limit: ${limit}, offset: ${offset})`,
    );

    // Query database
    const result = await this.db
      .select()
      .from(entities)
      .where(eq(entities.entityType, entityType))
      .limit(limit)
      .offset(offset)
      .orderBy(
        sortDirection === "desc"
          ? desc(sortBy === "created" ? entities.created : entities.updated)
          : asc(sortBy === "created" ? entities.created : entities.updated),
      );

    // Convert from markdown to entities
    const entityList: T[] = [];
    const adapter = this.entityRegistry.getAdapter<T>(entityType);

    for (const entityData of result) {
      try {
        // Extract entity-specific fields from markdown
        const parsedContent = adapter.fromMarkdown(entityData.content);

        // Merge database fields with parsed content
        const entity = {
          // Core fields from database
          id: entityData.id,
          entityType: entityData.entityType,
          title: entityData.title,
          created: new Date(entityData.created).toISOString(),
          updated: new Date(entityData.updated).toISOString(),
          tags: entityData.tags,

          // Entity-specific fields from adapter
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
   * Search entities by tags
   */
  public async searchEntitiesByTags(
    tags: string[],
    options: {
      limit?: number | undefined;
      offset?: number | undefined;
      types?: string[] | undefined;
    } = {},
  ): Promise<SearchResult[]> {
    if (tags.length === 0) {
      return [];
    }

    const validatedOptions = searchOptionsSchema.parse(options);
    const { limit, offset, types } = validatedOptions;

    this.logger.debug(`Searching entities by tags: ${tags.join(", ")}`);

    // Query database
    const query = this.db.select().from(entities).limit(limit).offset(offset);

    // Add type filter if provided
    if (types.length > 0) {
      await query.where(inArray(entities.entityType, types));
    }

    const result = await query;

    // Filter results by tags (we need to post-process since SQLite JSON support is limited)
    const matchingEntities = result
      .map((entity) => selectEntitySchema.parse(entity))
      .filter((entity) => {
        return tags.some((tag) => entity.tags.includes(tag));
      });

    // Convert to SearchResult format
    const searchResults: SearchResult[] = [];

    for (const entityData of matchingEntities) {
      try {
        // Count matching tags for scoring
        const matchingTagCount = tags.filter((tag) =>
          entityData.tags.includes(tag),
        ).length;
        const score = matchingTagCount / tags.length;

        // Reconstruct entity from database and markdown
        const adapter = this.entityRegistry.getAdapter(entityData.entityType);
        const parsedContent = adapter.fromMarkdown(entityData.content);

        const entity = this.entityRegistry.validateEntity<BaseEntity>(
          entityData.entityType,
          {
            id: entityData.id,
            entityType: entityData.entityType,
            title: entityData.title,
            created: new Date(entityData.created).toISOString(),
            updated: new Date(entityData.updated).toISOString(),
            tags: entityData.tags,
            ...parsedContent,
          },
        );

        // Create excerpt from content
        const excerpt =
          entityData.content.slice(0, 200) +
          (entityData.content.length > 200 ? "..." : "");

        searchResults.push({
          entity,
          score,
          excerpt,
          highlights: [], // Tag-based search doesn't have highlights
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to parse entity with ID ${entityData.id}: ${errorMessage}`,
        );
        // Skip invalid entities and continue
      }
    }

    // Sort by score
    searchResults.sort((a, b) => b.score - a.score);

    this.logger.info(`Found ${searchResults.length} entities matching tags`);

    return searchResults;
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
      title: entities.title,
      content: entities.content,
      created: entities.created,
      updated: entities.updated,
      tags: entities.tags,
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

        const entity = this.entityRegistry.validateEntity<BaseEntity>(
          row.entityType,
          {
            id: row.id,
            entityType: row.entityType,
            title: row.title,
            created: new Date(row.created).toISOString(),
            updated: new Date(row.updated).toISOString(),
            tags: row.tags,
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
    title: string;
    content: string;
    created: Date;
    updated: Date;
  }): Promise<void> {
    // Build BaseEntity from file data
    const entity: BaseEntity = {
      id: data.id,
      entityType: data.entityType,
      title: data.title,
      content: data.content,
      tags: [], // Default empty tags
      created: data.created.toISOString(),
      updated: data.updated.toISOString(),
    };

    // Check if entity exists
    const existing = await this.getEntity(data.entityType, entity.id);

    if (existing) {
      // Update if modified (compare timestamps)
      const existingTime = new Date(existing.updated).getTime();
      const newTime = data.updated.getTime();
      if (existingTime < newTime) {
        await this.updateEntity(entity);
      }
    } else {
      // Create new entity
      await this.createEntity(entity);
    }
  }
}
