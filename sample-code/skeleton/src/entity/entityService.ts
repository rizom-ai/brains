import { EntityRegistry, BaseEntity, IContentModel } from "./entityRegistry";
import { Logger } from "../utils/logger";
import { EmbeddingService } from "../ai/embedding";
import { TaggingService } from "../ai/tagging";
import { z } from "zod";
import { eq, inArray, like, desc, asc, and, SQL, sql } from "drizzle-orm";
import { DrizzleDB, entities, entityEmbeddings, createId } from "../db/schema";

/**
 * Search options schema
 */
export const searchOptionsSchema = z.object({
  types: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().positive().default(20),
  offset: z.number().nonnegative().default(0),
  sortBy: z.enum(["relevance", "created", "updated"]).default("relevance"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

export type SearchOptions = z.infer<typeof searchOptionsSchema>;

/**
 * Search result type
 */
export type SearchResult = {
  id: string;
  entityType: string;
  tags: string[];
  created: string;
  updated: string;
  score: number;
  entity: BaseEntity & IContentModel;
};

/**
 * Entity service for all entity operations
 */
export class EntityService {
  private entityRegistry: EntityRegistry;
  private db: DrizzleDB;
  private logger: Logger;
  private embeddingService: EmbeddingService;
  private taggingService: TaggingService;

  /**
   * Create a new entity service
   */
  constructor(
    entityRegistry: EntityRegistry,
    db: DrizzleDB,
    embeddingService: EmbeddingService,
    taggingService: TaggingService,
    logger: Logger,
  ) {
    this.entityRegistry = entityRegistry;
    this.db = db;
    this.embeddingService = embeddingService;
    this.taggingService = taggingService;
    this.logger = logger;
  }

  /**
   * Process and save an entity
   * - Validate entity
   * - Generate tags if missing
   * - Generate markdown
   * - Generate embedding
   * - Save to database
   */
  async saveEntity<T extends BaseEntity & IContentModel>(
    entity: T,
  ): Promise<T> {
    this.logger.info(`Saving ${entity.entityType} entity ${entity.id}`);

    // Validate entity against its schema
    const validatedEntity = this.entityRegistry.validateEntity<T>(
      entity.entityType,
      entity,
    );

    // Process entity before saving
    const processedEntity = await this.processEntity(validatedEntity);

    // Convert entity to markdown
    const markdown = this.entityRegistry.entityToMarkdown(processedEntity);

    // Generate embedding for the entire entity
    const embedding = await this.embeddingService.embed(markdown);

    // Save entity to database
    await this.db
      .insert(entities)
      .values({
        id: processedEntity.id,
        entityType: processedEntity.entityType,
        created: processedEntity.created,
        updated: processedEntity.updated,
        tags: processedEntity.tags,
        markdown: markdown,
      })
      .onConflictDoUpdate({
        target: entities.id,
        set: {
          updated: processedEntity.updated,
          tags: processedEntity.tags,
          markdown: markdown,
        },
      });

    // Save embedding
    await this.db
      .insert(entityEmbeddings)
      .values({
        id: createId(),
        entityId: processedEntity.id,
        embedding: embedding,
        createdAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: [entityEmbeddings.entityId],
        set: {
          embedding: embedding,
          createdAt: new Date().toISOString(),
        },
      });

    return processedEntity;
  }

  /**
   * Process an entity before saving
   * - Generate tags if missing
   * - Set created/updated timestamps
   */
  private async processEntity<T extends BaseEntity & IContentModel>(
    entity: T,
  ): Promise<T> {
    // Get adapter for entity type
    const adapter = this.entityRegistry.getAdapter<T>(entity.entityType);

    // Create a processed copy of the entity
    let processedEntity = { ...entity };

    // Generate tags if needed
    if (!entity.tags || entity.tags.length === 0) {
      this.logger.info(
        `Generating tags for ${entity.entityType} entity ${entity.id}`,
      );

      const content = adapter.toMarkdown(entity);
      const tags = await this.taggingService.generateTags(content);

      processedEntity = {
        ...processedEntity,
        tags,
      };
    }

    // Ensure timestamps are set
    if (!processedEntity.created) {
      processedEntity.created = new Date().toISOString();
    }

    processedEntity.updated = new Date().toISOString();

    return processedEntity;
  }

  /**
   * Get an entity by ID
   */
  async getEntity<T extends BaseEntity & IContentModel>(
    id: string,
  ): Promise<T | null> {
    // Get entity from database
    const result = await this.db
      .select()
      .from(entities)
      .where(eq(entities.id, id))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const entity = result[0];

    // Convert markdown to entity
    return this.entityRegistry.markdownToEntity<T>(
      entity.entityType,
      entity.markdown,
    );
  }

  /**
   * Get an entity by ID and type
   */
  async getEntityByType<T extends BaseEntity & IContentModel>(
    type: string,
    id: string,
  ): Promise<T | null> {
    // Get entity from database
    const result = await this.db
      .select()
      .from(entities)
      .where(and(eq(entities.id, id), eq(entities.entityType, type)))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const entity = result[0];

    // Convert markdown to entity
    return this.entityRegistry.markdownToEntity<T>(type, entity.markdown);
  }

  /**
   * Delete an entity by ID
   */
  async deleteEntity(id: string): Promise<boolean> {
    // Delete entity embeddings
    await this.db
      .delete(entityEmbeddings)
      .where(eq(entityEmbeddings.entityId, id));

    // Delete entity
    const result = await this.db.delete(entities).where(eq(entities.id, id));

    return result.rowCount > 0;
  }

  /**
   * Get all entities of a specific type
   */
  async getAllEntities<T extends BaseEntity & IContentModel>(
    type: string,
    options?: { limit?: number; offset?: number; tags?: string[] },
  ): Promise<T[]> {
    // Create base query
    let query = this.db
      .select()
      .from(entities)
      .where(eq(entities.entityType, type));

    // Filter by tags if provided
    if (options?.tags && options.tags.length > 0) {
      for (const tag of options.tags) {
        // Add tag filter for each tag (SQLite JSON contains)
        // Using a hacky approach because SQLite doesn't have native JSON containment
        query = query.where(
          sql`json_extract(${entities.tags}, '$') LIKE ${`%"${tag}"%`}`,
        );
      }
    }

    // Add ordering
    query = query.orderBy(desc(entities.updated));

    // Add limit and offset
    if (options?.limit) {
      query = query.limit(options.limit);
    } else {
      query = query.limit(100);
    }

    if (options?.offset) {
      query = query.offset(options.offset);
    }

    // Execute query
    const results = await query;

    // Convert markdown to entities
    return Promise.all(
      results.map((row) =>
        this.entityRegistry.markdownToEntity<T>(type, row.markdown),
      ),
    );
  }

  /**
   * Search for entities by tags
   */
  async searchByTags(
    tags: string[],
    options?: Partial<SearchOptions>,
  ): Promise<SearchResult[]> {
    if (!tags || tags.length === 0) {
      return [];
    }

    // Parse options
    const searchOptions = searchOptionsSchema.parse(options || {});

    // Create base query
    let query = this.db.select().from(entities);

    // Filter by entity type
    if (searchOptions.types && searchOptions.types.length > 0) {
      query = query.where(inArray(entities.entityType, searchOptions.types));
    }

    // Filter by tags
    for (const tag of tags) {
      // Add tag filter for each tag (SQLite JSON contains)
      query = query.where(
        sql`json_extract(${entities.tags}, '$') LIKE ${`%"${tag}"%`}`,
      );
    }

    // Add ordering
    if (searchOptions.sortBy === "relevance") {
      // For tag search, sort by updated as relevance isn't applicable
      query =
        searchOptions.sortDirection === "desc"
          ? query.orderBy(desc(entities.updated))
          : query.orderBy(asc(entities.updated));
    } else {
      // Sort by specified field
      const column =
        searchOptions.sortBy === "created"
          ? entities.created
          : entities.updated;

      query =
        searchOptions.sortDirection === "desc"
          ? query.orderBy(desc(column))
          : query.orderBy(asc(column));
    }

    // Add limit and offset
    query = query.limit(searchOptions.limit).offset(searchOptions.offset);

    // Execute query
    const results = await query;

    // Convert to search results
    return Promise.all(
      results.map(async (row) => {
        // Convert markdown to entity
        const entity = this.entityRegistry.markdownToEntity(
          row.entityType,
          row.markdown,
        );

        return {
          id: entity.id,
          entityType: entity.entityType,
          tags: entity.tags,
          created: entity.created,
          updated: entity.updated,
          score: 1.0, // Default score for tag matches
          entity,
        };
      }),
    );
  }

  /**
   * Semantic search using embeddings
   */
  async semanticSearch(
    query: string,
    options?: Partial<SearchOptions>,
  ): Promise<SearchResult[]> {
    // Parse options
    const searchOptions = searchOptionsSchema.parse(options || {});

    // Generate embedding for query
    const queryEmbedding = await this.embeddingService.embed(query);

    // Get entities with embeddings
    const entitiesWithEmbeddings = await this.db
      .select({
        entity: entities,
        embedding: entityEmbeddings.embedding,
      })
      .from(entities)
      .innerJoin(entityEmbeddings, eq(entities.id, entityEmbeddings.entityId))
      .where(
        // Add type filter if specified
        searchOptions.types && searchOptions.types.length > 0
          ? inArray(entities.entityType, searchOptions.types)
          : undefined,
      )
      .limit(searchOptions.limit * 3); // Get more for ranking

    // Calculate similarities and filter
    const resultsWithScores = await Promise.all(
      entitiesWithEmbeddings.map(async ({ entity, embedding }) => {
        // Calculate similarity
        const similarity = await this.embeddingService.calculateSimilarity(
          queryEmbedding,
          embedding,
        );

        // Convert markdown to entity object
        const entityObj = this.entityRegistry.markdownToEntity(
          entity.entityType,
          entity.markdown,
        );

        // Filter by tags if specified
        if (searchOptions.tags && searchOptions.tags.length > 0) {
          const matchesTags = this.hasAllTags(entityObj, searchOptions.tags);
          if (!matchesTags) {
            return null;
          }
        }

        return {
          id: entityObj.id,
          entityType: entityObj.entityType,
          tags: entityObj.tags,
          created: entityObj.created,
          updated: entityObj.updated,
          score: similarity,
          entity: entityObj,
        };
      }),
    );

    // Filter out nulls, sort by score, and apply limit
    return resultsWithScores
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, searchOptions.limit);
  }

  /**
   * Check if an entity has all the specified tags
   */
  private hasAllTags(
    entity: BaseEntity & IContentModel,
    tags: string[],
  ): boolean {
    if (!entity.tags || entity.tags.length === 0) {
      return false;
    }

    return tags.every((tag) => entity.tags.includes(tag));
  }
}
