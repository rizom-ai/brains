import type { EntityDB } from "./db";
import type { BaseEntity, SearchResult, SearchOptions } from "./types";
import type { IEmbeddingService } from "./embedding-types";
import type { EntitySerializer } from "./entity-serializer";
import { z, type Logger } from "@brains/utils";
import { sql, and, desc, type SQL } from "drizzle-orm";
import { entities } from "./schema/entities";

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
  private serializer: EntitySerializer;
  private logger: Logger;

  constructor(
    db: EntityDB,
    embeddingService: IEmbeddingService,
    serializer: EntitySerializer,
    logger: Logger,
  ) {
    this.db = db;
    this.embeddingService = embeddingService;
    this.serializer = serializer;
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

    return this.searchWithAttachedDb<T>(
      embeddingArray,
      weightCase,
      typeConditions,
      limit,
      offset,
      query,
    );
  }

  /**
   * Execute search against an attached embedding database (aliased as "emb").
   * Uses raw SQL because Drizzle doesn't know about cross-DB table references.
   */
  /**
   * FTS5 boost weight. When a keyword match is found, this fraction of the
   * final score comes from FTS5 rank, the rest from vector similarity.
   * 0.3 = 30% keyword, 70% semantic.
   */
  private static readonly FTS_ALPHA = 0.3;

  private async searchWithAttachedDb<T extends BaseEntity = BaseEntity>(
    embeddingArray: string,
    weightCase: string,
    typeConditions: SQL[],
    limit: number,
    offset: number,
    query: string,
  ): Promise<SearchResult<T>[]> {
    const alpha = EntitySearch.FTS_ALPHA;

    // Vector similarity score (0..1, higher is better)
    const vectorScore = sql<number>`(1.0 - vector_distance_cos(emb_e.embedding, vector32(${embeddingArray})) / 2.0) * ${sql.raw(weightCase)}`;
    const distanceExpr = sql<number>`vector_distance_cos(emb_e.embedding, vector32(${embeddingArray}))`;

    // FTS5 keyword boost via subquery: 1.0 when matched, 0.0 when not
    const ftsBoost = sql<number>`CASE WHEN EXISTS (
      SELECT 1 FROM entity_fts WHERE entity_fts MATCH ${query}
        AND entity_id = ${entities.id} AND entity_type = ${entities.entityType}
    ) THEN 1.0 ELSE 0.0 END`;

    // Combined score: (1-α)*vector + α*keyword_match
    const combinedScore = sql<number>`(${1 - alpha} * ${vectorScore}) + (${alpha} * ${ftsBoost})`;

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
        weighted_score: combinedScore,
      })
      .from(entities)
      .innerJoin(
        sql`emb.embeddings AS emb_e`,
        sql`${entities.id} = emb_e.entity_id AND ${entities.entityType} = emb_e.entity_type`,
      )
      .where(and(sql`${distanceExpr} < 0.82`, ...typeConditions))
      .orderBy(desc(combinedScore))
      .limit(limit)
      .offset(offset);

    return this.mapSearchResults<T>(results, query);
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
   * Return all embedded entities with their raw cosine distance to the query.
   * No threshold filter — used for diagnostics and threshold tuning.
   * Results sorted by distance ascending (closest first).
   */
  public async searchWithDistances(
    query: string,
  ): Promise<
    Array<{ entityId: string; entityType: string; distance: number }>
  > {
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);
    const embeddingArray = JSON.stringify(Array.from(queryEmbedding));

    const distanceExpr = sql<number>`vector_distance_cos(emb_e.embedding, vector32(${embeddingArray}))`;

    const results = await this.db
      .select({
        entityId: entities.id,
        entityType: entities.entityType,
        distance: distanceExpr,
      })
      .from(entities)
      .innerJoin(
        sql`emb.embeddings AS emb_e`,
        sql`${entities.id} = emb_e.entity_id AND ${entities.entityType} = emb_e.entity_type`,
      )
      .orderBy(sql`${distanceExpr} ASC`);

    return results;
  }

  /**
   * Transform raw query rows into SearchResult objects
   */
  private mapSearchResults<T extends BaseEntity = BaseEntity>(
    results: Array<{
      id: string;
      entityType: string;
      content: string;
      contentHash: string;
      created: number;
      updated: number;
      metadata: unknown;
      weighted_score: number;
    }>,
    query: string,
  ): SearchResult<T>[] {
    const searchResults: SearchResult<T>[] = [];

    for (const row of results) {
      try {
        const metadata: Record<string, unknown> =
          typeof row.metadata === "string"
            ? JSON.parse(row.metadata)
            : (row.metadata as Record<string, unknown>);

        const entity = this.serializer.reconstructEntity<T>({
          id: row.id,
          entityType: row.entityType,
          content: row.content,
          contentHash: row.contentHash,
          created: row.created,
          updated: row.updated,
          metadata,
        });

        searchResults.push({
          entity,
          score: row.weighted_score,
          excerpt: this.createExcerpt(row.content, query),
        });
      } catch (error) {
        this.logger.error(`Failed to parse entity during search: ${error}`);
      }
    }

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
}
