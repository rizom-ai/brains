import type { EntityDB } from "./db";
import type { BaseEntity, SearchResult, SearchOptions } from "./types";
import type { IEmbeddingService } from "@brains/embedding-service";
import type { EntityRegistry } from "./entityRegistry";
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";
import { sql, eq, and, desc } from "drizzle-orm";
import { entities } from "./schema/entities";
import { embeddings } from "./schema/embeddings";

/**
 * Schema for search options (excluding tags)
 */
const searchOptionsSchema = z.object({
  limit: z.number().int().positive().optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
  types: z.array(z.string()).optional().default([]),
  excludeTypes: z.array(z.string()).optional().default([]),
  weight: z.record(z.string(), z.number()).optional(),
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
    const { limit, offset, types, excludeTypes, weight } = validatedOptions;

    // Check if we have weights to apply
    const hasWeights = weight && Object.keys(weight).length > 0;

    this.logger.debug(`Searching entities with query: "${query}"`);

    // Generate embedding for the query
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);

    // Convert Float32Array to JSON array for SQL
    const embeddingArray = JSON.stringify(Array.from(queryEmbedding));

    // Build weight CASE expression if weights provided
    let weightCase = "1.0";
    if (hasWeights) {
      const cases = Object.entries(weight)
        .map(([entityType, w]) => `WHEN entityType = '${entityType}' THEN ${w}`)
        .join(" ");
      weightCase = `CASE ${cases} ELSE 1.0 END`;
    }

    // Build type filter conditions for drizzle
    const typeConditions = [];
    if (types.length > 0) {
      typeConditions.push(
        sql`${entities.entityType} IN (${sql.join(
          types.map((t) => sql`${t}`),
          sql`, `,
        )})`,
      );
    }
    if (excludeTypes.length > 0) {
      typeConditions.push(
        sql`${entities.entityType} NOT IN (${sql.join(
          excludeTypes.map((t) => sql`${t}`),
          sql`, `,
        )})`,
      );
    }

    // Build the vector distance and weighted score SQL expressions
    const distanceExpr = sql<number>`vector_distance_cos(${embeddings.embedding}, vector32(${embeddingArray}))`;
    const weightedScoreExpr = sql<number>`(1.0 - vector_distance_cos(${embeddings.embedding}, vector32(${embeddingArray})) / 2.0) * ${sql.raw(weightCase)}`;

    // Execute query with INNER JOIN using drizzle query builder
    const results = await this.db
      .select({
        id: entities.id,
        entityType: entities.entityType,
        content: entities.content,
        contentHash: entities.contentHash,
        created: entities.created,
        updated: entities.updated,
        metadata: entities.metadata,
        distance: distanceExpr,
        weighted_score: weightedScoreExpr,
      })
      .from(entities)
      .innerJoin(
        embeddings,
        and(
          eq(entities.id, embeddings.entityId),
          eq(entities.entityType, embeddings.entityType),
        ),
      )
      .where(and(sql`${distanceExpr} < 1.0`, ...typeConditions))
      .orderBy(desc(weightedScoreExpr))
      .limit(limit)
      .offset(offset);

    // Transform results into SearchResult format
    const searchResults: SearchResult<T>[] = [];

    for (const row of results) {
      try {
        const adapter = this.entityRegistry.getAdapter(row.entityType);
        const parsedContent = adapter.fromMarkdown(row.content);

        const metadata: Record<string, unknown> =
          typeof row.metadata === "string"
            ? JSON.parse(row.metadata)
            : row.metadata;
        const entity = this.entityRegistry.validateEntity<T>(row.entityType, {
          id: row.id,
          entityType: row.entityType,
          content: row.content,
          contentHash: row.contentHash,
          created: new Date(row.created).toISOString(),
          updated: new Date(row.updated).toISOString(),
          metadata,
          ...metadata,
          ...parsedContent,
        });

        // Use weighted_score from SQL (already includes weight multipliers if provided)
        const score = row.weighted_score;

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
