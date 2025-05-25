import type { DrizzleDB } from "../db";
import { entities, createId, selectEntitySchema } from "../db/schema";
import { EntityRegistry } from "./entityRegistry";
import type { EntityAdapter } from "./entityRegistry";
import { Logger, extractIndexedFields } from "@brains/utils";
import type { IEmbeddingService } from "../embedding/embeddingService";
import { calculateCosineSimilarity } from "../utils/similarity";
import type {
  BaseEntity,
  IContentModel,
  SearchResult,
  SearchOptions,
} from "../types";
import { eq, and, inArray, desc, asc } from "drizzle-orm";
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
  public async createEntity<T extends BaseEntity & IContentModel>(
    entity: Omit<T, "id"> & { id?: string },
  ): Promise<T> {
    this.logger.debug(`Creating entity of type: ${entity.entityType}`);

    // Generate ID if not provided
    const entityWithId = {
      ...entity,
      id: entity.id ?? createId(),
    } as T;

    // Validate entity against its schema
    const validatedEntity = this.entityRegistry.validateEntity<T>(
      entity.entityType,
      entityWithId,
    );

    // Convert to markdown
    const markdown = this.entityRegistry.entityToMarkdown(validatedEntity);

    // Extract indexed fields from markdown
    const { title, tags, contentWeight } = extractIndexedFields(
      markdown,
      validatedEntity.id,
    );

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
      `Created entity of type ${entity.entityType} with ID ${validatedEntity.id}`,
    );

    return validatedEntity;
  }

  /**
   * Get an entity by ID
   */
  public async getEntity<T extends BaseEntity & IContentModel>(
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

    // Convert from markdown to entity
    try {
      const entity = this.entityRegistry.markdownToEntity<T>(
        entityType,
        entityData.content,
      );

      return entity;
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
  public async updateEntity<T extends BaseEntity & IContentModel>(
    entity: T,
  ): Promise<T> {
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

    // Convert to markdown
    const markdown = this.entityRegistry.entityToMarkdown(validatedEntity);

    // Extract indexed fields from markdown
    const { title, tags, contentWeight } = extractIndexedFields(
      markdown,
      validatedEntity.id,
    );

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
  public async listEntities<T extends BaseEntity & IContentModel>(
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

    for (const entityData of result) {
      try {
        const entity = this.entityRegistry.markdownToEntity<T>(
          entityType,
          entityData.content,
        );

        entityList.push(entity);
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

        // Parse the entity
        const entity = this.entityRegistry.markdownToEntity<
          BaseEntity & IContentModel
        >(entityData.entityType, entityData.content);

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
  public getAdapter<T extends BaseEntity & IContentModel>(
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

    // Build the base query
    const baseQuery = this.db
      .select({
        id: entities.id,
        entityType: entities.entityType,
        title: entities.title,
        content: entities.content,
        created: entities.created,
        updated: entities.updated,
        tags: entities.tags,
        embedding: entities.embedding,
      })
      .from(entities);

    // Execute the query with type filter if specified
    const results = await (types.length > 0
      ? baseQuery.where(inArray(entities.entityType, types))
      : baseQuery);

    // Calculate similarity scores and filter/sort results
    const searchResults: SearchResult[] = [];

    for (const row of results) {
      // Calculate cosine similarity
      const similarity = calculateCosineSimilarity(
        queryEmbedding,
        row.embedding,
      );

      // Only include results above a threshold (e.g., 0.5)
      if (similarity > 0.5) {
        // Parse entity from markdown
        const entity = this.entityRegistry.markdownToEntity(
          row.entityType,
          row.content,
        );

        // Create a more readable excerpt
        const excerpt = this.createExcerpt(row.content, query);

        searchResults.push({
          entity,
          score: similarity,
          excerpt,
          highlights: [], // TODO: Implement highlight extraction
        });
      }
    }

    // Sort by similarity score (highest first)
    searchResults.sort((a, b) => b.score - a.score);

    // Apply pagination
    const paginatedResults = searchResults.slice(offset, offset + limit);

    this.logger.info(
      `Found ${searchResults.length} results for query "${query}", returning ${paginatedResults.length}`,
    );

    return paginatedResults;
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
}
