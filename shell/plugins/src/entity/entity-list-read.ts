import type {
  BaseEntity,
  EntitySchema,
  EntityServiceClient,
  ListOptions,
  PaginationInfo,
  SortField,
} from "@brains/entity-service";
import { buildPaginationInfo } from "@brains/entity-service";
import { z } from "@brains/utils/zod";

interface DataSourceQuerySchemaShape {
  id: z.ZodOptional<z.ZodString>;
  limit: z.ZodOptional<z.ZodNumber>;
  page: z.ZodOptional<z.ZodNumber>;
  pageSize: z.ZodOptional<z.ZodNumber>;
  baseUrl: z.ZodOptional<z.ZodString>;
}

type DataSourceQuerySchema = ReturnType<
  typeof z.looseObject<DataSourceQuerySchemaShape>
>;

/** The query a template sends a list-and-detail source. */
const dataSourceQuerySchema: DataSourceQuerySchema = z.looseObject({
  id: z.string().optional(),
  limit: z.number().optional(),
  page: z.number().optional(),
  pageSize: z.number().optional(),
  baseUrl: z.string().optional(),
});

interface DataSourceInputSchemaShape {
  entityType: z.ZodOptional<z.ZodString>;
  query: z.ZodOptional<typeof dataSourceQuerySchema>;
}

type DataSourceInputSchema = ReturnType<
  typeof z.looseObject<DataSourceInputSchemaShape>
>;

/** What a template hands a source: the type it reads, and its query. */
const dataSourceInputSchema: DataSourceInputSchema = z.looseObject({
  entityType: z.string().optional(),
  query: dataSourceQuerySchema.optional(),
});

/** The query a template sends a list-and-detail source. */
export type EntitySourceQuery = z.output<typeof dataSourceQuerySchema>;

/** A detail view's neighbors in the source's order. */
export interface EntityNavigation<T> {
  prev: T | null;
  next: T | null;
}

/** How a list-and-detail source reads its one type. */
export interface EntityListReadConfig<TEntity extends BaseEntity> {
  readonly entityType: string;
  /** Reads are parsed with it. */
  readonly entitySchema: EntitySchema<TEntity>;
  /** Order for lists and navigation. */
  readonly defaultSort: SortField[];
  /** Page size when the query names none (100). */
  readonly defaultLimit?: number | undefined;
  /** How `id` finds one entity: `metadata.slug` (default) or its id. */
  readonly lookupField?: "slug" | "id" | undefined;
  /** Whether a detail view gets prev/next (false). */
  readonly enableNavigation?: boolean | undefined;
  /** How many entities navigation reads to find neighbors (1000). */
  readonly navigationLimit?: number | undefined;
}

/** The query, its type defaulting to the source's own. */
export function parseEntitySourceQuery(query: unknown): EntitySourceQuery {
  return dataSourceInputSchema.parse(query).query ?? {};
}

/** One page of the type in the source's order, paged when asked to be. */
export async function listEntityPage<TEntity extends BaseEntity, TItem>(
  config: EntityListReadConfig<TEntity>,
  query: EntitySourceQuery,
  entityService: EntityServiceClient,
  transform: (entity: TEntity) => TItem,
  listOptions?: Partial<ListOptions>,
): Promise<{ items: TItem[]; pagination: PaginationInfo | null }> {
  const currentPage = query.page ?? 1;
  const itemsPerPage =
    query.pageSize ?? query.limit ?? config.defaultLimit ?? 100;
  const needsPagination = query.page !== undefined;
  // The page and, when paging, the total, read together.
  const [entities, totalItems] = await Promise.all([
    entityService.listEntities(
      {
        entityType: config.entityType,
        options: {
          limit: itemsPerPage,
          offset: (currentPage - 1) * itemsPerPage,
          sortFields: config.defaultSort,
          ...listOptions,
        },
      },
      config.entitySchema,
    ),
    needsPagination
      ? entityService.countEntities({
          entityType: config.entityType,
          options: listOptions?.filter
            ? { filter: listOptions.filter }
            : undefined,
        })
      : Promise.resolve(0),
  ]);
  return {
    items: entities.map(transform),
    pagination: needsPagination
      ? buildPaginationInfo(totalItems, currentPage, itemsPerPage)
      : null,
  };
}

/** One entity by the query's `id`, with its neighbors when navigation is on. */
export async function entityDetail<TEntity extends BaseEntity, TItem>(
  config: EntityListReadConfig<TEntity>,
  id: string,
  entityService: EntityServiceClient,
  transform: (entity: TEntity) => TItem,
): Promise<{ item: TItem; navigation: EntityNavigation<TItem> | null }> {
  const entity = await lookupEntity(config, id, entityService);
  return {
    item: transform(entity),
    navigation: config.enableNavigation
      ? await resolveNavigation(config, entity, entityService, transform)
      : null,
  };
}

async function resolveNavigation<TEntity extends BaseEntity, TItem>(
  config: EntityListReadConfig<TEntity>,
  entity: TEntity,
  entityService: EntityServiceClient,
  transform: (entity: TEntity) => TItem,
): Promise<EntityNavigation<TItem>> {
  const all = await entityService.listEntities(
    {
      entityType: config.entityType,
      options: {
        limit: config.navigationLimit ?? 1000,
        sortFields: config.defaultSort,
      },
    },
    config.entitySchema,
  );
  const at = all.findIndex((candidate) => candidate.id === entity.id);
  const prev = at > 0 ? all[at - 1] : undefined;
  const next = at < all.length - 1 ? all[at + 1] : undefined;
  return {
    prev: prev ? transform(prev) : null,
    next: next ? transform(next) : null,
  };
}

async function lookupEntity<TEntity extends BaseEntity>(
  config: EntityListReadConfig<TEntity>,
  id: string,
  entityService: EntityServiceClient,
): Promise<TEntity> {
  if (config.lookupField === "id") {
    const entity = await entityService.getEntity(
      { entityType: config.entityType, id },
      config.entitySchema,
    );
    if (!entity) throw new Error(`${config.entityType} not found: ${id}`);
    return entity;
  }
  const [entity] = await entityService.listEntities(
    {
      entityType: config.entityType,
      options: { filter: { metadata: { slug: id } }, limit: 1 },
    },
    config.entitySchema,
  );
  if (!entity) {
    throw new Error(`${config.entityType} not found with slug: ${id}`);
  }
  return entity;
}
