import type { JsonObject, JsonObjectOutputGuard } from "@brains/contracts";
import type {
  BaseDataSourceContext,
  BaseEntity,
  DataSourceSchema,
  PaginationInfo,
  SortField,
} from "@brains/entity-service";
import type { LoggerContract } from "@brains/utils/logger";
import {
  BaseEntityDataSource,
  type BaseQuery,
  type EntityDataSourceConfig,
  type NavigationResult,
} from "../service/base-entity-datasource";

/**
 * An entity-backed data source, declared rather than subclassed.
 *
 * The author supplies configuration and pure functions over already-loaded
 * entities. Every read — listing, counting, pagination, prev/next
 * navigation — stays on the runtime side.
 *
 * That split is what makes this publishable. The `DataSource` interface
 * cannot cross the published declaration boundary: its `fetch` takes a
 * context carrying a scoped entity service, which reaches the projection
 * store, so exporting it would drag the entity-service runtime into
 * `dist/*.d.ts`. Nothing here references a runtime service, so it inlines
 * as plain data.
 */
export interface EntityDataSourceDefinition<
  TEntity extends BaseEntity = BaseEntity,
  TTransformed = TEntity,
  TListResult extends object = JsonObject,
> {
  readonly kind: "rizom-entity-data-source";
  /** Local id. The runtime scopes it to the installed package. */
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly config: EntityDataSourceConfig;
  transform(entity: TEntity): TTransformed;
  list(
    items: TTransformed[],
    pagination: PaginationInfo | null,
    query: BaseQuery,
  ): TListResult & JsonObjectOutputGuard<TListResult>;
  detail?(context: EntityDetailContext<TTransformed>): unknown;
}

/**
 * What a detail view is given. `siblings` is the same list the runtime
 * already loads to resolve prev/next, so a data source that orders its
 * detail navigation differently from its list sort can compute that
 * itself instead of overriding `fetch` and reaching for the entity
 * service.
 */
export interface EntityDetailContext<TTransformed> {
  readonly item: TTransformed;
  readonly navigation: NavigationResult<TTransformed> | null;
  readonly siblings: readonly TTransformed[];
}

export function defineEntityDataSource<
  TEntity extends BaseEntity = BaseEntity,
  TTransformed = TEntity,
  TListResult extends object = JsonObject,
>(definition: {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly entityType: string;
  readonly defaultSort: SortField[];
  readonly defaultLimit?: number | undefined;
  readonly lookupField?: "slug" | "id" | undefined;
  readonly enableNavigation?: boolean | undefined;
  readonly navigationLimit?: number | undefined;
  transform(entity: TEntity): TTransformed;
  list(
    items: TTransformed[],
    pagination: PaginationInfo | null,
    query: BaseQuery,
  ): TListResult & JsonObjectOutputGuard<TListResult>;
  detail?(context: EntityDetailContext<TTransformed>): unknown;
}): EntityDataSourceDefinition<TEntity, TTransformed, TListResult> {
  return Object.freeze({
    kind: "rizom-entity-data-source" as const,
    id: definition.id,
    name: definition.name,
    description: definition.description,
    config: {
      entityType: definition.entityType,
      defaultSort: definition.defaultSort,
      ...(definition.defaultLimit === undefined
        ? {}
        : { defaultLimit: definition.defaultLimit }),
      ...(definition.lookupField === undefined
        ? {}
        : { lookupField: definition.lookupField }),
      ...(definition.enableNavigation === undefined
        ? {}
        : { enableNavigation: definition.enableNavigation }),
      ...(definition.navigationLimit === undefined
        ? {}
        : { navigationLimit: definition.navigationLimit }),
    },
    transform: definition.transform,
    list: definition.list,
    ...(definition.detail ? { detail: definition.detail } : {}),
  });
}

/**
 * A declared data source with its transform type erased, which is how an
 * entity definition stores a heterogeneous list of them.
 *
 * The callbacks use method syntax deliberately: methods are compared
 * bivariantly, so a definition transforming to a concrete shape stays
 * assignable to this one even though the parameter positions differ.
 */
export interface AnyEntityDataSourceDefinition {
  readonly kind: "rizom-entity-data-source";
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly config: EntityDataSourceConfig;
  transform(entity: BaseEntity): unknown;
  list(
    items: unknown[],
    pagination: PaginationInfo | null,
    query: BaseQuery,
  ): JsonObject;
  detail?(context: EntityDetailContext<unknown>): unknown;
}

export function createDeclarativeEntityDataSource(
  definition: AnyEntityDataSourceDefinition,
  scopedId: string,
  logger: LoggerContract,
): BaseEntityDataSource<BaseEntity, unknown, JsonObject> {
  class DeclarativeEntityDataSource extends BaseEntityDataSource<
    BaseEntity,
    unknown,
    JsonObject
  > {
    public readonly id = scopedId;
    public readonly name = definition.name;
    public readonly description = definition.description;
    protected readonly config = definition.config;

    protected override transformEntity(entity: BaseEntity): unknown {
      return definition.transform(entity);
    }

    protected override buildListResult(
      items: unknown[],
      pagination: PaginationInfo | null,
      query: BaseQuery,
    ): JsonObject {
      return definition.list(items, pagination, query);
    }

    protected override buildDetailResult(): unknown {
      throw new Error(
        `Data source "${scopedId}" builds detail views through fetch()`,
      );
    }

    override async fetch<T>(
      query: unknown,
      outputSchema: DataSourceSchema<T>,
      context: BaseDataSourceContext,
    ): Promise<T> {
      const params = this.parseQuery(query);
      const entityService = context.entityService;

      if (!params.query.id) {
        const list = await this.fetchList(params.query, entityService);
        return outputSchema.parse(
          this.buildListResult(list.items, list.pagination, params.query),
        );
      }

      const detail = definition.detail;
      if (!detail) {
        throw new Error(
          `Data source "${scopedId}" was queried for a single entity but declares no detail view`,
        );
      }

      // The sibling list is what resolveNavigation already loads; surfacing
      // it lets a detail view order its own prev/next without an entity
      // service of its own.
      const [resolved, siblings] = await Promise.all([
        this.fetchDetail(params.query.id, entityService),
        this.fetchList(
          { limit: this.config.navigationLimit ?? 1000 },
          entityService,
        ),
      ]);

      return outputSchema.parse(
        detail({
          item: resolved.item,
          navigation: resolved.navigation,
          siblings: siblings.items,
        }),
      );
    }
  }

  return new DeclarativeEntityDataSource(logger);
}
