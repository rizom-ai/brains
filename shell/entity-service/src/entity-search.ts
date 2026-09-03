import {
  buildKeywordMatch,
  buildKeywordScore,
  type EntitySearchDB,
} from "./db";
import {
  getVisibleContentVisibilities,
  type BaseEntity,
  type ContentVisibility,
  type SearchResult,
  type SearchOptions,
  type ProjectSemanticSpaceRequest,
  type SemanticSpaceProjection,
} from "./types";
import type { IEmbeddingService } from "./embedding-types";
import type { EntitySerializer } from "./entity-serializer";
import { type Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { sql, and, asc, desc, inArray, type SQL } from "drizzle-orm";
import { entities } from "./schema/entities";
import {
  buildSemanticSpaceProjection,
  type SemanticEmbedding,
} from "./semantic-space";

/**
 * The one embedding call search makes: it embeds the prepared query.
 *
 * IEmbeddingService also generates in batches and reports its dimensions;
 * asking for all of it meant a test could not supply one function without
 * asserting it was the whole service.
 */
export type QueryEmbedder = Pick<IEmbeddingService, "generateEmbedding">;

export const MAX_SEARCH_QUERY_CHARS = 12_000;
const MAX_VECTOR_DISTANCE = 0.82;
const MIN_LEXICAL_MATCH_SCORE = 0.5;

function prepareSearchQuery(
  query: string,
  logger?: Logger,
  maxChars: number = MAX_SEARCH_QUERY_CHARS,
): string {
  const normalizedQuery = query.trim().replace(/\s+/g, " ");

  if (normalizedQuery.length <= maxChars) {
    return normalizedQuery;
  }

  logger?.warn("Truncating search query that exceeds max length", {
    originalLength: normalizedQuery.length,
    truncatedLength: maxChars,
  });

  return normalizedQuery.slice(0, maxChars);
}

/**
 * Schema for search options (excluding tags)
 */
const searchOptionsSchema = z.object({
  limit: z.number().int().positive().optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
  types: z.array(z.string()).optional().default([]),
  excludeTypes: z.array(z.string()).optional().default([]),
  weight: z.record(z.string(), z.number()).optional(),
  visibilityScope: z.enum(["public", "shared", "restricted"]).optional(),
  includeUngenerated: z.boolean().optional().default(false),
  minScore: z.number().min(0).optional(),
});

const entityMetadataSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    return JSON.parse(value);
  },
  z.record(z.string(), z.unknown()),
);

/**
 * EntitySearch handles all search operations for entities
 * Extracted from EntityService for single responsibility
 */
export class EntitySearch {
  private db: EntitySearchDB;
  private embeddingService: QueryEmbedder;
  private serializer: EntitySerializer;
  private logger: Logger;
  private readonly embeddingsEnabled: boolean;
  private readonly excludedLexicalTypes: () => string[];

  constructor(
    db: EntitySearchDB,
    embeddingService: QueryEmbedder,
    serializer: EntitySerializer,
    logger: Logger,
    embeddingsEnabled = true,
    // Lazy: types register after construction. `fullTextSearchable: false`
    // types are excluded here because the portable scan reads entity content
    // directly — there is no index row to skip.
    excludedLexicalTypes: () => string[] = () => [],
  ) {
    this.db = db;
    this.embeddingService = embeddingService;
    this.serializer = serializer;
    this.logger = logger.child("EntitySearch");
    this.embeddingsEnabled = embeddingsEnabled;
    this.excludedLexicalTypes = excludedLexicalTypes;
  }

  private buildLexicalExclusionConditions(): SQL[] {
    const excluded = this.excludedLexicalTypes();
    if (excluded.length === 0) return [];
    return [
      sql`${entities.entityType} NOT IN (${sql.join(
        excluded.map((type) => sql`${type}`),
        sql`, `,
      )})`,
    ];
  }

  /**
   * Search entities by query using vector similarity
   */
  public async search<T extends BaseEntity = BaseEntity>(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult<T>[]> {
    const validatedOptions = searchOptionsSchema.parse(options ?? {});
    const {
      limit,
      offset,
      types,
      excludeTypes,
      weight,
      visibilityScope,
      includeUngenerated,
      minScore,
    } = validatedOptions;

    // Check if we have weights to apply
    const hasWeights = weight && Object.keys(weight).length > 0;
    const preparedQuery = prepareSearchQuery(query, this.logger);

    this.logger.debug(
      `Searching entities with query (${preparedQuery.length} chars)`,
    );

    if (!this.embeddingsEnabled) {
      return this.searchLexically<T>(preparedQuery, {
        limit,
        offset,
        types,
        excludeTypes,
        weight,
        visibilityScope,
        includeUngenerated,
        minScore,
      });
    }

    // Generate embedding for the query
    const { embedding: queryEmbedding } =
      await this.embeddingService.generateEmbedding(preparedQuery);

    // Convert Float32Array to JSON array for SQL
    const embeddingArray = JSON.stringify(Array.from(queryEmbedding));

    const weightMultiplier = this.buildWeightMultiplier(
      hasWeights ? weight : undefined,
    );

    // Build type filter conditions for drizzle
    const typeConditions: SQL[] = [];
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
      weightMultiplier,
      [
        ...typeConditions,
        ...this.buildVisibilityConditions(visibilityScope),
        ...this.buildGenerationStatusConditions(includeUngenerated),
      ],
      limit,
      offset,
      preparedQuery,
      minScore,
    );
  }

  private async searchLexically<T extends BaseEntity>(
    query: string,
    options: {
      readonly limit: number;
      readonly offset: number;
      readonly types: string[];
      readonly excludeTypes: string[];
      readonly weight: Record<string, number> | undefined;
      readonly visibilityScope: ContentVisibility | undefined;
      readonly includeUngenerated: boolean;
      readonly minScore: number | undefined;
    },
  ): Promise<SearchResult<T>[]> {
    if (!query) return [];
    const conditions: SQL[] = [
      buildKeywordMatch(query),
      ...this.buildLexicalExclusionConditions(),
    ];
    if (options.types.length > 0) {
      conditions.push(inArray(entities.entityType, options.types));
    }
    if (options.excludeTypes.length > 0) {
      conditions.push(
        sql`${entities.entityType} NOT IN (${sql.join(
          options.excludeTypes.map((type) => sql`${type}`),
          sql`, `,
        )})`,
      );
    }
    conditions.push(
      ...this.buildVisibilityConditions(options.visibilityScope),
      ...this.buildGenerationStatusConditions(options.includeUngenerated),
    );

    const multiplier = this.buildWeightMultiplier(options.weight);
    const keywordScore = buildKeywordScore(query);
    // A complete lexical match always clears the system's default threshold,
    // even when a type-specific multiplier is below one.
    const weightedScore = sql<number>`max(${MIN_LEXICAL_MATCH_SCORE}, (${keywordScore}) * (${multiplier}))`;
    if (options.minScore !== undefined) {
      conditions.push(sql`${weightedScore} >= ${options.minScore}`);
    }
    const results = await this.db
      .select({
        id: entities.id,
        entityType: entities.entityType,
        content: entities.content,
        contentHash: entities.contentHash,
        visibility: entities.visibility,
        created: entities.created,
        updated: entities.updated,
        metadata: entities.metadata,
        weighted_score: weightedScore.as("weighted_score"),
      })
      .from(entities)
      .where(and(...conditions))
      .orderBy(
        sql`weighted_score DESC`,
        desc(entities.updated),
        asc(entities.entityType),
        asc(entities.id),
      )
      .limit(options.limit)
      .offset(options.offset);

    return this.mapSearchResults<T>(results, query);
  }

  private buildVisibilityConditions(
    visibilityScope?: ContentVisibility,
  ): SQL[] {
    // Fail closed: undefined scope filters to public-only.
    const scope: ContentVisibility = visibilityScope ?? "public";
    if (scope === "restricted") {
      return [];
    }
    return [inArray(entities.visibility, getVisibleContentVisibilities(scope))];
  }

  private buildGenerationStatusConditions(includeUngenerated: boolean): SQL[] {
    if (includeUngenerated) return [];
    return [
      sql`(json_extract(${entities.metadata}, '$.status') IS NULL OR json_extract(${entities.metadata}, '$.status') NOT IN ('generating', 'failed'))`,
    ];
  }

  /**
   * Keyword boost weight. When a keyword match is found, this fraction of
   * the final score comes from keyword matching, the rest from vector similarity.
   * 0.3 = 30% keyword, 70% semantic.
   */
  private static readonly KEYWORD_ALPHA = 0.3;

  /**
   * Build a parameterized CASE expression for entity-type score multipliers.
   * Weight keys may be caller-provided, so avoid raw SQL string interpolation.
   */
  private buildWeightMultiplier(weight?: Record<string, number>): SQL<number> {
    const entries = Object.entries(weight ?? {}).filter(([, multiplier]) =>
      Number.isFinite(multiplier),
    );

    if (entries.length === 0) {
      return sql`1.0`;
    }

    const cases = entries.map(
      ([entityType, multiplier]) =>
        sql`WHEN ${entities.entityType} = ${entityType} THEN ${multiplier}`,
    );

    return sql`CASE ${sql.join(cases, sql` `)} ELSE 1.0 END`;
  }

  /**
   * Execute hybrid search against the local embeddings table.
   */
  private async searchWithAttachedDb<T extends BaseEntity = BaseEntity>(
    embeddingArray: string,
    weightMultiplier: SQL,
    typeConditions: SQL[],
    limit: number,
    offset: number,
    query: string,
    minScore: number | undefined,
  ): Promise<SearchResult<T>[]> {
    const alpha = EntitySearch.KEYWORD_ALPHA;

    // Materialize the query vector once. Repeating vector32(?) in each score,
    // distance, filter, and ordering expression needlessly decoded the same
    // 1,536-dimension value several times per search.
    const queryVector = sql`(SELECT vector32(${embeddingArray}) AS embedding LIMIT 1) AS query_vector`;
    const distanceExpr = sql<number>`CASE
      WHEN emb_e.embedding IS NULL THEN 2.0
      ELSE vector_distance_cos(emb_e.embedding, query_vector.embedding)
    END`;
    const vectorScore = sql<number>`(1.0 - ${distanceExpr} / 2.0) * (${weightMultiplier})`;
    const keywordMatch = sql.join(
      [buildKeywordMatch(query), ...this.buildLexicalExclusionConditions()],
      sql` AND `,
    );
    const keywordScore = sql<number>`CASE WHEN ${keywordMatch} THEN ${buildKeywordScore(query)} ELSE 0.0 END`;
    const lexicalOnlyScore = sql<number>`max(${MIN_LEXICAL_MATCH_SCORE}, (${keywordScore}) * (${weightMultiplier}))`;
    const combinedScore = sql<number>`CASE
      WHEN emb_e.embedding IS NULL THEN ${lexicalOnlyScore}
      ELSE (${1 - alpha} * ${vectorScore}) + (${alpha} * ${keywordScore})
    END`;

    const results = await this.db
      .select({
        id: entities.id,
        entityType: entities.entityType,
        content: entities.content,
        contentHash: entities.contentHash,
        visibility: entities.visibility,
        created: entities.created,
        updated: entities.updated,
        metadata: entities.metadata,
        distance: distanceExpr,
        weighted_score: combinedScore,
      })
      .from(entities)
      .innerJoin(queryVector, sql`1 = 1`)
      .leftJoin(
        sql`embeddings AS emb_e`,
        sql`${entities.id} = emb_e.entity_id AND ${entities.entityType} = emb_e.entity_type`,
      )
      .where(
        and(
          sql`(${distanceExpr} < ${MAX_VECTOR_DISTANCE} OR ${keywordMatch})`,
          ...(minScore !== undefined
            ? [sql`${combinedScore} >= ${minScore}`]
            : []),
          ...typeConditions,
        ),
      )
      .orderBy(
        desc(combinedScore),
        desc(entities.updated),
        asc(entities.entityType),
        asc(entities.id),
      )
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
    options?: { limit?: number | undefined },
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
   * Project visible entity embeddings into a provider-independent semantic
   * space. Raw vectors never cross the entity-service boundary.
   */
  public async projectSemanticSpace(
    request: ProjectSemanticSpaceRequest,
  ): Promise<SemanticSpaceProjection> {
    if (!this.embeddingsEnabled) {
      throw new Error("Semantic indexing is disabled for this Brain instance");
    }
    const pointTypes =
      request.types && request.types.length > 0
        ? new Set(request.types)
        : undefined;
    const queryTypes = pointTypes ? new Set(pointTypes) : undefined;
    if (queryTypes && request.origin) {
      queryTypes.add(request.origin.entityType);
    }

    const embeddings = await this.readEmbeddings(
      queryTypes ? Array.from(queryTypes) : undefined,
      request.visibilityScope,
    );
    const originReference = request.origin;
    const origin = originReference
      ? embeddings.find(
          (embedding) =>
            embedding.entityId === originReference.entityId &&
            embedding.entityType === originReference.entityType,
        )
      : undefined;
    const points = embeddings.filter((embedding) => {
      const matchesPointType = pointTypes?.has(embedding.entityType) ?? true;
      const isOrigin =
        embedding.entityId === originReference?.entityId &&
        embedding.entityType === originReference.entityType;
      return matchesPointType && !isOrigin;
    });

    return buildSemanticSpaceProjection(points, {
      ...(origin && { origin }),
      ...(request.maxNeighborDistance !== undefined && {
        maxNeighborDistance: request.maxNeighborDistance,
      }),
    });
  }

  /** Read and decode vectors from the entity database. */
  private async readEmbeddings(
    types?: string[],
    visibilityScope?: ContentVisibility,
  ): Promise<SemanticEmbedding[]> {
    const conditions = this.buildVisibilityConditions(visibilityScope);
    if (types && types.length > 0) {
      conditions.push(inArray(entities.entityType, types));
    }

    const embeddingExpr = sql<Float32Array>`emb_e.embedding`.mapWith({
      mapFromDriverValue(value: unknown): Float32Array {
        if (!ArrayBuffer.isView(value)) {
          throw new TypeError(
            "Expected embedding blob to be an ArrayBuffer view",
          );
        }

        const source = new Uint8Array(
          value.buffer,
          value.byteOffset,
          value.byteLength,
        );
        if (source.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
          throw new RangeError(
            "Embedding blob byte length must be divisible by 4",
          );
        }

        const copy = new Uint8Array(source.byteLength);
        copy.set(source);
        return new Float32Array(copy.buffer);
      },
    });

    return this.db
      .select({
        entityId: entities.id,
        entityType: entities.entityType,
        embedding: embeddingExpr,
      })
      .from(entities)
      .innerJoin(
        sql`embeddings AS emb_e`,
        sql`${entities.id} = emb_e.entity_id AND ${entities.entityType} = emb_e.entity_type`,
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(entities.entityType), asc(entities.id));
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
    if (!this.embeddingsEnabled) {
      throw new Error("Semantic indexing is disabled for this Brain instance");
    }
    const preparedQuery = prepareSearchQuery(query, this.logger);
    const { embedding: queryEmbedding } =
      await this.embeddingService.generateEmbedding(preparedQuery);
    const embeddingArray = JSON.stringify(Array.from(queryEmbedding));

    const queryVector = sql`(SELECT vector32(${embeddingArray}) AS embedding LIMIT 1) AS query_vector`;
    const distanceExpr = sql<number>`vector_distance_cos(emb_e.embedding, query_vector.embedding)`;

    const results = await this.db
      .select({
        entityId: entities.id,
        entityType: entities.entityType,
        distance: distanceExpr,
      })
      .from(entities)
      .innerJoin(queryVector, sql`1 = 1`)
      .innerJoin(
        sql`embeddings AS emb_e`,
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
      visibility: ContentVisibility;
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
        const metadata = entityMetadataSchema.parse(row.metadata);

        const entity = this.serializer.reconstructEntity<T>({
          id: row.id,
          entityType: row.entityType,
          content: row.content,
          contentHash: row.contentHash,
          visibility: row.visibility,
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
