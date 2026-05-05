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
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";

export type { SortField };

/**
 * Zod schema for the base query fields.
 * Subclasses can extend this with `.extend()` for additional fields.
 */
export const baseQuerySchema = z
  .object({
    id: z.string().optional(),
    limit: z.number().optional(),
    page: z.number().optional(),
    pageSize: z.number().optional(),
    baseUrl: z.string().optional(),
  })
  .passthrough();

/**
 * Zod schema for the outer datasource input (entityType + query).
 * Subclasses can extend the inner query via `baseQuerySchema.extend()`.
 */
export const baseInputSchema = z
  .object({
    entityType: z.string().optional(),
    query: baseQuerySchema.optional(),
  })
  .passthrough();

/**
 * Parsed base query parameters.
 * Subclasses can extend this with additional fields via `parseQuery()`.
 */
export type BaseQuery = z.infer<typeof baseQuerySchema>;

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
  /** Max entities to fetch when resolving prev/next navigation (defaults to 1000) */
  navigationLimit?: number;
}

/**
 * Base class for entity datasources that follow the list/detail pattern.
 *
 * Provides:
 * - Query parsing with Zod validation
 * - Detail view: entity lookup (by slug or id), optional prev/next navigation
 * - List view: paginated fetch with sorting
 *
 * Subclasses implement:
 * - `transformEntity()` — convert raw entity to display format
 * - `buildListResult()` — shape the list response
 *
 * Optionally override:
 * - `buildDetailResult()` — shape the detail response (default throws; override
 *   this OR override `fetch()` to handle detail views directly)
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
   * Override this if using the base class's standard detail path.
   * Datasources that fully override `fetch()` for detail views need not implement this.
   *
   * @param item - The transformed entity
   * @param navigation - Prev/next entities (null if navigation is disabled)
   */
  protected buildDetailResult(
    _item: TTransformed,
    _navigation: NavigationResult<TTransformed> | null,
  ): unknown {
    throw new Error(
      `${this.id}: buildDetailResult() not implemented. ` +
        `Override this method or override fetch() to handle detail views.`,
    );
  }

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
  ): unknown;

  /**
   * Parse and validate the incoming query with Zod.
   * Override to support additional query parameters beyond the base set.
   * Use `baseQuerySchema.extend()` or `baseInputSchema` for validation.
   */
  protected parseQuery(query: unknown): {
    entityType: string;
    query: BaseQuery;
  } {
    const parsed = baseInputSchema.parse(query);
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

    const needsPagination = query.page !== undefined;

    // Run list and count queries in parallel when pagination is needed
    const [entities, totalItems] = await Promise.all([
      entityService.listEntities<TEntity>({
        entityType: this.config.entityType,
        options: {
          limit: itemsPerPage,
          offset,
          sortFields: this.config.defaultSort,
          ...listOptions,
        },
      }),
      needsPagination
        ? entityService.countEntities({
            entityType: this.config.entityType,
            options: listOptions?.filter
              ? { filter: listOptions.filter }
              : undefined,
          })
        : Promise.resolve(0),
    ]);

    const items = entities.map((e) => this.transformEntity(e));

    const pagination = needsPagination
      ? buildPaginationInfo(totalItems, currentPage, itemsPerPage)
      : null;

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
    const limit = this.config.navigationLimit ?? 1000;
    const allEntities = await entityService.listEntities<TEntity>({
      entityType: this.config.entityType,
      options: {
        limit,
        sortFields: sortFields ?? this.config.defaultSort,
      },
    });

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

  /**
   * Look up a single entity by id or slug.
   * Uses `config.lookupField` to determine the strategy.
   */
  protected async lookupEntity(
    id: string,
    entityService: IEntityService,
  ): Promise<TEntity> {
    if (this.config.lookupField === "id") {
      const entity = await entityService.getEntity<TEntity>({
        entityType: this.config.entityType,
        id: id,
      });
      if (!entity) {
        throw new Error(`${this.config.entityType} not found: ${id}`);
      }
      return entity;
    }

    // Default: lookup by slug in metadata
    const entities = await entityService.listEntities<TEntity>({
      entityType: this.config.entityType,
      options: {
        filter: { metadata: { slug: id } },
        limit: 1,
      },
    });

    const entity = entities[0];
    if (!entity) {
      throw new Error(`${this.config.entityType} not found with slug: ${id}`);
    }
    return entity;
  }
}
