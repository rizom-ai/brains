import type {
  DataSource,
  BaseDataSourceContext,
  IEntityService,
  BaseEntity,
  ListOptions,
  SortField,
  PaginationInfo,
} from "@brains/entity-service";
import { buildPaginationInfo } from "@brains/entity-service";
import type { Logger, z } from "@brains/utils";

export type { SortField };

/**
 * Parsed base query parameters.
 * Subclasses can extend this with additional fields via `parseQuery()`.
 */
export interface BaseQuery {
  id?: string;
  limit?: number;
  page?: number;
  pageSize?: number;
  baseUrl?: string;
}

/**
 * Navigation context for detail views (prev/next entities).
 */
export interface NavigationResult<T> {
  prev: T | null;
  next: T | null;
}

/**
 * Configuration for a BaseEntityDataSource.
 */
export interface EntityDataSourceConfig {
  /** Entity type to query (e.g., "post", "deck", "project") */
  entityType: string;
  /** Default sort order for list and navigation queries */
  defaultSort: SortField[];
  /** Default limit for list queries (defaults to 100) */
  defaultLimit?: number;
  /**
   * How to look up a single entity by the `id` query param.
   * - "slug": filter by `metadata.slug` (default)
   * - "id": direct `getEntity()` lookup
   */
  lookupField?: "slug" | "id";
  /** Enable prev/next navigation on detail views (defaults to false) */
  enableNavigation?: boolean;
}

/**
 * Base class for entity datasources that follow the list/detail pattern.
 *
 * Provides:
 * - Query parsing with a standard base schema
 * - Detail view: entity lookup (by slug or id), optional prev/next navigation
 * - List view: paginated fetch with sorting
 *
 * Subclasses implement:
 * - `transformEntity()` — convert raw entity to display format
 * - `buildDetailResult()` — shape the detail response (property names vary per plugin)
 * - `buildListResult()` — shape the list response
 *
 * For datasources with extra query cases (e.g., "latest", "series", "nextInQueue"),
 * override `fetch()` to handle those first, then call `super.fetch()` for the standard path.
 */
export abstract class BaseEntityDataSource<
  TEntity extends BaseEntity = BaseEntity,
  TTransformed = TEntity,
> implements DataSource {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;

  protected abstract readonly config: EntityDataSourceConfig;

  constructor(protected readonly logger: Logger) {}

  /**
   * Transform a raw entity into the display format used by templates.
   * Called for both list items and detail views.
   */
  protected abstract transformEntity(entity: TEntity): TTransformed;

  /**
   * Build the detail response object.
   * @param item - The transformed entity
   * @param navigation - Prev/next entities (null if navigation is disabled)
   */
  protected abstract buildDetailResult(
    item: TTransformed,
    navigation: NavigationResult<TTransformed> | null,
  ): Record<string, unknown>;

  /**
   * Build the list response object.
   * @param items - Transformed entities
   * @param pagination - Pagination info (null if no page param was provided)
   * @param query - The parsed query params (for passing through baseUrl, etc.)
   */
  protected abstract buildListResult(
    items: TTransformed[],
    pagination: PaginationInfo | null,
    query: BaseQuery,
  ): Record<string, unknown>;

  /**
   * Parse and validate the incoming query.
   * Override to support additional query parameters beyond the base set.
   * The returned object must include at least the BaseQuery fields.
   */
  protected parseQuery(query: unknown): {
    entityType: string;
    query: BaseQuery;
  } {
    const parsed = query as { entityType?: string; query?: BaseQuery };
    return {
      entityType: parsed.entityType ?? this.config.entityType,
      query: parsed.query ?? {},
    };
  }

  /**
   * Standard fetch implementation: dispatch to detail or list based on query.id.
   *
   * Override to handle custom query cases before falling through to the standard path:
   * ```typescript
   * async fetch<T>(query, outputSchema, context) {
   *   const params = this.parseQuery(query);
   *   if (params.query.latest) {
   *     return this.fetchLatest(outputSchema, context.entityService);
   *   }
   *   return super.fetch(query, outputSchema, context);
   * }
   * ```
   */
  async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const params = this.parseQuery(query);
    const entityService = context.entityService;

    if (params.query.id) {
      const result = await this.fetchDetail(params.query.id, entityService);
      return outputSchema.parse(
        this.buildDetailResult(result.item, result.navigation),
      );
    }

    const result = await this.fetchList(params.query, entityService);
    return outputSchema.parse(
      this.buildListResult(result.items, result.pagination, params.query),
    );
  }

  // ── Protected utilities (available to subclasses for custom cases) ──

  /**
   * Fetch a single entity and optionally resolve prev/next navigation.
   */
  protected async fetchDetail(
    id: string,
    entityService: IEntityService,
  ): Promise<{
    item: TTransformed;
    navigation: NavigationResult<TTransformed> | null;
  }> {
    const entity = await this.lookupEntity(id, entityService);
    const item = this.transformEntity(entity);

    let navigation: NavigationResult<TTransformed> | null = null;
    if (this.config.enableNavigation) {
      navigation = await this.resolveNavigation(entity, entityService);
    }

    return { item, navigation };
  }

  /**
   * Fetch a paginated list of entities.
   */
  protected async fetchList(
    query: BaseQuery,
    entityService: IEntityService,
    listOptions?: Partial<ListOptions>,
  ): Promise<{ items: TTransformed[]; pagination: PaginationInfo | null }> {
    const currentPage = query.page ?? 1;
    const itemsPerPage =
      query.pageSize ?? query.limit ?? this.config.defaultLimit ?? 100;
    const offset = (currentPage - 1) * itemsPerPage;

    const entities = await entityService.listEntities<TEntity>(
      this.config.entityType,
      {
        limit: itemsPerPage,
        offset,
        sortFields: this.config.defaultSort,
        ...listOptions,
      },
    );

    const items = entities.map((e) => this.transformEntity(e));

    let pagination: PaginationInfo | null = null;
    if (query.page !== undefined) {
      const totalItems = await entityService.countEntities(
        this.config.entityType,
        listOptions?.filter ? { filter: listOptions.filter } : undefined,
      );
      pagination = buildPaginationInfo(totalItems, currentPage, itemsPerPage);
    }

    return { items, pagination };
  }

  /**
   * Resolve prev/next navigation for a given entity within the sorted list.
   */
  protected async resolveNavigation(
    entity: TEntity,
    entityService: IEntityService,
    sortFields?: SortField[],
  ): Promise<NavigationResult<TTransformed>> {
    const allEntities = await entityService.listEntities<TEntity>(
      this.config.entityType,
      {
        limit: 1000,
        sortFields: sortFields ?? this.config.defaultSort,
      },
    );

    const currentIndex = allEntities.findIndex((e) => e.id === entity.id);
    const prevEntity =
      currentIndex > 0 ? allEntities[currentIndex - 1] : undefined;
    const nextEntity =
      currentIndex < allEntities.length - 1
        ? allEntities[currentIndex + 1]
        : undefined;
    const prev = prevEntity ? this.transformEntity(prevEntity) : null;
    const next = nextEntity ? this.transformEntity(nextEntity) : null;

    return { prev, next };
  }

  // ── Private helpers ──

  private async lookupEntity(
    id: string,
    entityService: IEntityService,
  ): Promise<TEntity> {
    if (this.config.lookupField === "id") {
      const entity = await entityService.getEntity<TEntity>(
        this.config.entityType,
        id,
      );
      if (!entity) {
        throw new Error(`${this.config.entityType} not found: ${id}`);
      }
      return entity;
    }

    // Default: lookup by slug in metadata
    const entities = await entityService.listEntities<TEntity>(
      this.config.entityType,
      {
        filter: { metadata: { slug: id } },
        limit: 1,
      },
    );

    const entity = entities[0];
    if (!entity) {
      throw new Error(`${this.config.entityType} not found with slug: ${id}`);
    }
    return entity;
  }
}
