import type { EntityDB } from "./db";
import type { BaseEntity, SearchResult, SearchOptions } from "./types";
import type { IEmbeddingService } from "@brains/embedding-service";
import type { EntityRegistry } from "./entityRegistry";
import type { Logger } from "@brains/utils";
import { entities } from "./schema/entities";
import { and, inArray, sql } from "drizzle-orm";
import { z } from "zod";

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
 * EntitySearch handles all search operations for entities
 * Extracted from EntityService for single responsibility
 */
export class EntitySearch {
  private db: EntityDB;
  private embeddingService: IEmbeddingService;
  private entityRegistry: EntityRegistry;
  private logger: Logger;

  constructor(
    db: EntityDB,
    embeddingService: IEmbeddingService,
    entityRegistry: EntityRegistry,
    logger: Logger,
  ) {
    this.db = db;
    this.embeddingService = embeddingService;
    this.entityRegistry = entityRegistry;
    this.logger = logger.child("EntitySearch");
  }

  /**
   * Search entities by query using vector similarity
   */
  public async search<T extends BaseEntity = BaseEntity>(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult<T>[]> {
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
    const searchResults: SearchResult<T>[] = [];

    for (const row of results) {
      try {
        const adapter = this.entityRegistry.getAdapter(row.entityType);
        const parsedContent = adapter.fromMarkdown(row.content);

        const metadata = row.metadata as Record<string, unknown>;
        const entity = this.entityRegistry.validateEntity<T>(row.entityType, {
          id: row.id,
          entityType: row.entityType,
          content: row.content,
          created: new Date(row.created).toISOString(),
          updated: new Date(row.updated).toISOString(),
          ...metadata,
          ...parsedContent,
        });

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
}
