import type { DrizzleDB } from "../db";
import { entities, createId, selectEntitySchema } from "../db/schema";
import { EntityRegistry } from "./entityRegistry";
import { Logger } from "../utils/logger";
import type { BaseEntity, IContentModel, SearchResult } from "../types";
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
 * EntityService provides CRUD operations for entities
 * Implements Component Interface Standardization pattern
 */
export class EntityService {
  private static instance: EntityService | null = null;

  private db: DrizzleDB;
  private entityRegistry: EntityRegistry;
  private logger: Logger;

  /**
   * Get the singleton instance of EntityService
   */
  public static getInstance(
    db: DrizzleDB,
    entityRegistry: EntityRegistry = EntityRegistry.getInstance(
      Logger.getInstance(),
    ),
    logger: Logger = Logger.getInstance(),
  ): EntityService {
    if (!EntityService.instance) {
      EntityService.instance = new EntityService(db, entityRegistry, logger);
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
  public static createFresh(
    db: DrizzleDB,
    entityRegistry: EntityRegistry,
    logger: Logger,
  ): EntityService {
    return new EntityService(db, entityRegistry, logger);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(
    db: DrizzleDB,
    entityRegistry: EntityRegistry,
    logger: Logger,
  ) {
    this.db = db;
    this.entityRegistry = entityRegistry;
    this.logger = logger.child("EntityService");
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

    // Store in database
    await this.db.insert(entities).values({
      id: validatedEntity.id,
      entityType: validatedEntity.entityType,
      created: validatedEntity.created,
      updated: validatedEntity.updated,
      tags: validatedEntity.tags,
      markdown,
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
        entityData.markdown,
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

    // Update in database
    await this.db
      .update(entities)
      .set({
        entityType: validatedEntity.entityType,
        updated: validatedEntity.updated,
        tags: validatedEntity.tags,
        markdown,
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
          entityData.markdown,
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
      limit?: number;
      offset?: number;
      types?: string[];
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
        return tags.some((tag) => (entity.tags ?? []).includes(tag));
      });

    // Convert to SearchResult format
    const searchResults: SearchResult[] = [];

    for (const entityData of matchingEntities) {
      try {
        // Count matching tags for scoring
        const matchingTagCount = tags.filter((tag) =>
          (entityData.tags ?? []).includes(tag),
        ).length;
        const score = matchingTagCount / tags.length;

        // Parse the entity
        const entity = this.entityRegistry.markdownToEntity<
          BaseEntity & IContentModel
        >(entityData.entityType, entityData.markdown);

        searchResults.push({
          id: entityData.id,
          entityType: entityData.entityType,
          tags: entityData.tags ?? [],
          created: entityData.created,
          updated: entityData.updated,
          score,
          entity,
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
}
