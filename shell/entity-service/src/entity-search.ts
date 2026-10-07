import type { EntitySearchDB } from "./db";
import {
  getVisibleContentVisibilities,
  type BaseEntity,
  type ContentVisibility,
  type SearchResult,
  type SearchOptions,
  type NearestToEntityRequest,
  type ProjectSemanticSpaceRequest,
  type SemanticSpaceProjection,
} from "./types";
import type { IEmbeddingService } from "./embedding-types";
import type { EntitySerializer } from "./entity-serializer";
import { type Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { sql, and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { entities } from "./schema/entities";
import { publishedAcrossTypesCondition } from "./published-condition";
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
  publishedOnly: z.boolean().optional().default(false),
  minScore: z.number().min(0).optional(),
  signal: z.instanceof(AbortSignal).optional(),
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
  /** Published statuses by entity type, for the types that declare them. */
  private readonly publishGates: () => Record<string, string[]>;

  constructor(
    db: EntitySearchDB,
    embeddingService: QueryEmbedder,
    serializer: EntitySerializer,
    logger: Logger,
    embeddingsEnabled = true,
    publishGates: () => Record<string, string[]> = () => ({}),
  ) {
    this.db = db;
    this.embeddingService = embeddingService;
    this.serializer = serializer;
    this.logger = logger.child("EntitySearch");
    this.embeddingsEnabled = embeddingsEnabled;
    this.publishGates = publishGates;
  }

  /**
   * Search entities by query using vector similarity
   */
  public async search(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult<BaseEntity>[]> {
    const validatedOptions = searchOptionsSchema.parse(options ?? {});
    const {
      offset,
      types,
      excludeTypes,
      weight,
      visibilityScope,
      includeUngenerated,
      publishedOnly,
      minScore,
      signal,
      limit,
    } = validatedOptions;
    signal?.throwIfAborted();

    // Check if we have weights to apply
    const hasWeights = weight && Object.keys(weight).length > 0;
    const preparedQuery = prepareSearchQuery(query, this.logger);

    this.logger.debug(
      `Searching entities with query (${preparedQuery.length} chars)`,
    );

    if (!this.embeddingsEnabled) {
      return this.searchLexically(preparedQuery, {
        limit,
        offset,
        types,
        excludeTypes,
        weight,
        visibilityScope,
        includeUngenerated,
        publishedOnly,
        minScore,
        signal,
      });
    }

    // Generate embedding for the query
    const vector = (
      await (signal
        ? this.embeddingService.generateEmbedding(preparedQuery, signal)
        : this.embeddingService.generateEmbedding(preparedQuery))
    ).embedding;
    signal?.throwIfAborted();

    // Convert Float32Array to JSON array for SQL
    const embeddingArray = JSON.stringify(Array.from(vector));

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

    return this.searchWithAttachedDb(
      embeddingArray,
      weightMultiplier,
      [
        ...typeConditions,
        ...this.buildVisibilityConditions(visibilityScope),
        ...this.buildGenerationStatusConditions(includeUngenerated),
        ...this.buildPublishedConditions(publishedOnly),
      ],
      limit,
      offset,
      preparedQuery,
      minScore,
      signal,
    );
  }

  private async searchLexically(
    query: string,
    options: {
      readonly limit: number;
      readonly offset: number;
      readonly types: string[];
      readonly excludeTypes: string[];
      readonly weight: Record<string, number> | undefined;
      readonly visibilityScope: ContentVisibility | undefined;
      readonly includeUngenerated: boolean;
      readonly publishedOnly: boolean;
      readonly minScore: number | undefined;
      readonly signal: AbortSignal | undefined;
    },
  ): Promise<SearchResult<BaseEntity>[]> {
    if (!query) return [];
    const ftsQuery = '"' + query.replace(/"/g, '""') + '"';
    const conditions: SQL[] = [sql`entity_fts MATCH ${ftsQuery}`];
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
      ...this.buildPublishedConditions(options.publishedOnly),
    );

    // bm25() returns lower-is-better negative relevance. Map it to (0.5, 1)
    // so the system search default threshold still admits lexical matches,
    // while stronger matches remain ordered above weaker ones.
    const multiplier = this.buildWeightMultiplier(options.weight);
    const weightedScore = sql<number>`(0.5 + 0.5 * ((-bm25(entity_fts)) / (1.0 - bm25(entity_fts)))) * (${multiplier})`;
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
      .innerJoin(
        sql`entity_fts`,
        sql`entity_fts.entity_id = ${entities.id} AND entity_fts.entity_type = ${entities.entityType}`,
      )
      .where(and(...conditions))
      .orderBy(sql`weighted_score DESC`)
      .limit(options.limit)
      .offset(options.offset);
    options.signal?.throwIfAborted();
    return this.mapSearchResults(results, query);
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

  private buildPublishedConditions(publishedOnly: boolean): SQL[] {
    return publishedOnly
      ? [publishedAcrossTypesCondition(this.publishGates())]
      : [];
  }

  /**
   * FTS5 boost weight. When a keyword match is found, this fraction of the
   * final score comes from FTS5 rank, the rest from vector similarity.
   * 0.3 = 30% keyword, 70% semantic.
   */
  private static readonly FTS_ALPHA = 0.3;

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
   * Execute search against an attached embedding database (aliased as "emb").
   */
  private async searchWithAttachedDb(
    embeddingArray: string,
    weightMultiplier: SQL,
    typeConditions: SQL[],
    limit: number,
    offset: number,
    query: string,
    minScore: number | undefined,
    signal?: AbortSignal,
  ): Promise<SearchResult<BaseEntity>[]> {
    const alpha = EntitySearch.FTS_ALPHA;

    // Vector similarity score (0..1, higher is better)
    const vectorScore = sql<number>`(1.0 - vector_distance_cos(emb_e.embedding, vector32(${embeddingArray})) / 2.0) * (${weightMultiplier})`;
    const distanceExpr = sql<number>`vector_distance_cos(emb_e.embedding, vector32(${embeddingArray}))`;

    // FTS5 keyword boost via subquery: 1.0 when matched, 0.0 when not.
    // Wrap in double quotes for phrase matching — prevents special characters
    // (?, *, OR, AND, etc.) from being parsed as FTS5 operators.
    const ftsQuery = '"' + query.replace(/"/g, '""') + '"';
    const ftsBoost = sql<number>`CASE WHEN EXISTS (
      SELECT 1 FROM entity_fts WHERE entity_fts MATCH ${ftsQuery}
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
        visibility: entities.visibility,
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
      .where(
        and(
          sql`${distanceExpr} < ${MAX_VECTOR_DISTANCE}`,
          ...(minScore !== undefined
            ? [sql`${combinedScore} >= ${minScore}`]
            : []),
          ...typeConditions,
        ),
      )
      .orderBy(desc(combinedScore))
      .limit(limit)
      .offset(offset);
    signal?.throwIfAborted();
    return this.mapSearchResults(results, query);
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

    const embeddings = await this.readEmbeddings(
      pointTypes ? Array.from(pointTypes) : undefined,
      request.visibilityScope,
    );
    const originReference = request.origin;
    // An origin of a type outside the points is read alone: reading its whole
    // type to find one vector makes a page per entry quadratic.
    const origin = originReference
      ? (embeddings.find(
          (embedding) =>
            embedding.entityId === originReference.entityId &&
            embedding.entityType === originReference.entityType,
        ) ??
        (pointTypes?.has(originReference.entityType) === false
          ? (
              await this.readEmbeddings(
                [originReference.entityType],
                request.visibilityScope,
                originReference.entityId,
              )
            )[0]
          : undefined))
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

  /** Read and decode vectors from the attached embedding database. */
  private async readEmbeddings(
    types?: string[],
    visibilityScope?: ContentVisibility,
    entityId?: string,
  ): Promise<SemanticEmbedding[]> {
    const conditions = this.buildVisibilityConditions(visibilityScope);
    if (types && types.length > 0) {
      conditions.push(inArray(entities.entityType, types));
    }
    if (entityId !== undefined) {
      conditions.push(eq(entities.id, entityId));
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
        sql`emb.embeddings AS emb_e`,
        sql`${entities.id} = emb_e.entity_id AND ${entities.entityType} = emb_e.entity_type`,
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(entities.entityType), asc(entities.id));
  }

  /**
   * Visible entities of the given types nearest an entity's stored embedding,
   * closest first. The origin is read alone and within the same scope; an
   * origin out of scope or without an embedding has no neighbours.
   */
  public async nearestToEntity(
    request: NearestToEntityRequest,
  ): Promise<
    Array<{ entityId: string; entityType: string; distance: number }>
  > {
    if (!this.embeddingsEnabled) {
      throw new Error("Semantic indexing is disabled for this Brain instance");
    }
    const [origin] = await this.readEmbeddings(
      [request.origin.entityType],
      request.visibilityScope,
      request.origin.entityId,
    );
    if (!origin || request.types.length === 0) return [];

    const originVector = JSON.stringify(Array.from(origin.embedding));
    const distanceExpr = sql<number>`vector_distance_cos(emb_e.embedding, vector32(${originVector}))`;
    const query = this.db
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
      .where(
        and(
          ...this.buildVisibilityConditions(request.visibilityScope),
          inArray(entities.entityType, request.types),
          sql`NOT (${entities.id} = ${request.origin.entityId} AND ${entities.entityType} = ${request.origin.entityType})`,
          request.maxDistance !== undefined
            ? sql`${distanceExpr} <= ${request.maxDistance}`
            : undefined,
        ),
      )
      .orderBy(sql`${distanceExpr} ASC`);
    return request.limit !== undefined ? query.limit(request.limit) : query;
  }

  /**
   * Return embedded entities with their raw cosine distance to the query,
   * sorted closest first. Without filters every embedded entity is returned,
   * for diagnostics and threshold tuning; `types` and `maxDistance` narrow it
   * in the query for callers that look for one close match.
   */
  public async searchWithDistances(
    query: string,
    filters: {
      readonly types?: string[] | undefined;
      readonly maxDistance?: number | undefined;
    } = {},
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
      .where(
        and(
          filters.types && filters.types.length > 0
            ? inArray(entities.entityType, filters.types)
            : undefined,
          filters.maxDistance !== undefined
            ? sql`${distanceExpr} <= ${filters.maxDistance}`
            : undefined,
        ),
      )
      .orderBy(sql`${distanceExpr} ASC`);

    return results;
  }

  /**
   * Transform raw query rows into SearchResult objects
   */
  private mapSearchResults(
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
  ): SearchResult<BaseEntity>[] {
    const searchResults: SearchResult<BaseEntity>[] = [];

    for (const row of results) {
      try {
        const metadata = entityMetadataSchema.parse(row.metadata);

        const entity = this.serializer.reconstructEntity({
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
