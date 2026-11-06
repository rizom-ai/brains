import type { JsonObject } from "@brains/contracts";
import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
  EntityServiceClient,
  ListOptions,
  SortField,
} from "@brains/entity-service";
import type { Logger } from "@brains/utils/logger";
import { definedFields } from "@brains/utils/strip-undefined";
import { z } from "@brains/utils/zod";
import type {
  AnyDataSourceDeclaration,
  AnyEntityDataSourceDefinition,
  AnyEntityDefinition,
  DataSourceDefinition,
  DataSourceEntityReader,
  DataSourceListOptions,
  DataSourceSortField,
  EntityDataSourceDefinition,
  EntityDataSourceInput,
  EntityOf,
} from "../entity/entity-definition-contract";
import { entitySchema, parseDefinitionEntity } from "../entity/entity-schema";
import { assertIdentifier as assertLocalId } from "../package-definition";
import {
  BaseEntityDataSource,
  type BaseQuery,
  type EntityDataSourceConfig,
} from "../service/base-entity-datasource";

export type {
  AnyDataSourceDeclaration,
  AnyEntityDataSourceDefinition,
  DataSourceDefinition,
  DataSourceEntityReader,
  DataSourceListOptions,
  DataSourceQuery,
  DataSourceReadContext,
  DataSourceSortField,
  EntityDataSourceDefinition,
  EntityDataSourceInput,
  EntityDetailContext,
} from "../entity/entity-definition-contract";

type FetchDataSourceInput = Omit<DataSourceDefinition, "kind">;

/**
 * A source of data a template reads from, in one of two forms. A source
 * that **fetches** answers any query over definition-typed reads. A source
 * that names an **entity** lists and shows that declared type, and the
 * runtime does the paging, sorting, lookup and neighbor reads.
 */
export function defineDataSource(
  definition: FetchDataSourceInput,
): DataSourceDefinition;
export function defineDataSource<
  TDefinition extends AnyEntityDefinition,
  TTransformed = EntityOf<TDefinition>,
  TListResult extends object = JsonObject,
>(
  definition: EntityDataSourceInput<TDefinition, TTransformed, TListResult>,
): EntityDataSourceDefinition<TDefinition, TTransformed, TListResult>;
export function defineDataSource(
  definition:
    | FetchDataSourceInput
    | EntityDataSourceInput<AnyEntityDefinition, unknown, JsonObject>,
): AnyDataSourceDeclaration {
  assertLocalId(definition.id, "Data source id");
  // The forms are exclusive in the types; an untyped caller can still send
  // both or neither, and a source that silently took one branch would fetch
  // nothing or read nothing.
  if (
    Object.hasOwn(definition, "entity") === Object.hasOwn(definition, "fetch")
  ) {
    throw new Error(
      `Data source "${definition.id}" either fetches or reads an entity — this one declares both or neither`,
    );
  }
  return "entity" in definition
    ? Object.freeze({
        ...definition,
        kind: "rizom-entity-data-source",
        defaultSort: Object.freeze(
          definition.defaultSort.map((sort) => Object.freeze({ ...sort })),
        ),
      })
    : Object.freeze({
        kind: "rizom-data-source",
        id: definition.id,
        name: definition.name,
        description: definition.description,
        fetch: definition.fetch,
      });
}

function sortFields(sort: readonly DataSourceSortField[]): SortField[] {
  return sort.map(({ field, direction, nullsFirst, nullsLast }) => ({
    field,
    direction,
    ...definedFields({ nullsFirst, nullsLast }),
  }));
}

const dataSourceReadContextSchema = z.object({
  publishedOnly: z.boolean().optional(),
});

/** The definition-typed reads, over the build's scoped entity service. */
function dataSourceEntityReader(
  entityService: Pick<
    EntityServiceClient,
    "getEntity" | "listEntities" | "countEntities"
  >,
): DataSourceEntityReader {
  return {
    async get<TDefinition extends AnyEntityDefinition>(
      definition: TDefinition,
      id: string,
    ): Promise<EntityOf<TDefinition> | null> {
      const entity = await entityService.getEntity({
        entityType: definition.type,
        id,
      });
      return entity ? parseDefinitionEntity(definition, entity) : null;
    },
    async list<TDefinition extends AnyEntityDefinition>(
      definition: TDefinition,
      options?: DataSourceListOptions,
    ): Promise<readonly EntityOf<TDefinition>[]> {
      const entities = await entityService.listEntities({
        entityType: definition.type,
        options: definedFields({
          limit: options?.limit,
          offset: options?.offset,
          sortFields: options?.sort && sortFields(options.sort),
        }),
      });
      return entities.map((entity) =>
        parseDefinitionEntity(definition, entity),
      );
    },
    count: (definition) =>
      entityService.countEntities({ entityType: definition.type }),
  };
}

/** Bind a declared fetching data source to the runtime under its scoped id. */
function createFetchingDataSource(
  definition: DataSourceDefinition,
  scopedId: string,
): DataSource {
  return {
    id: scopedId,
    name: definition.name,
    description: definition.description,
    async fetch<T>(
      query: unknown,
      outputSchema: DataSourceSchema<T>,
      context: BaseDataSourceContext,
    ): Promise<T> {
      const readContext = Object.freeze(
        dataSourceReadContextSchema.parse(
          definedFields({ publishedOnly: context.publishedOnly }),
        ),
      );
      return outputSchema.parse(
        await definition.fetch(
          query,
          dataSourceEntityReader(context.entityService),
          readContext,
        ),
      );
    },
  };
}

/** The list options a declared filter contributes: an exact metadata match. */
function filterOptions(
  definition: AnyEntityDataSourceDefinition,
  query: BaseQuery,
): Partial<ListOptions> | undefined {
  const metadata = definition.filter?.(query)?.metadata;
  return metadata ? { filter: { metadata: { ...metadata } } } : undefined;
}

/** Bind a declared entity data source to the runtime under its scoped id. */
function createEntityDataSource(
  definition: AnyEntityDataSourceDefinition,
  scopedId: string,
  logger: Logger,
): DataSource {
  const config: EntityDataSourceConfig<EntityOf<AnyEntityDefinition>> = {
    entityType: definition.entity.type,
    // Derived from the definition, as EntityOf is: authors never declare the
    // runtime-owned base fields.
    entitySchema: entitySchema(definition.entity),
    defaultSort: sortFields(definition.defaultSort),
    ...definedFields({
      defaultLimit: definition.defaultLimit,
      lookupField: definition.lookupField,
      enableNavigation: definition.enableNavigation,
      navigationLimit: definition.navigationLimit,
    }),
  };

  class DeclarativeEntityDataSource extends BaseEntityDataSource<
    EntityOf<AnyEntityDefinition>,
    unknown,
    JsonObject
  > {
    public readonly id = scopedId;
    public readonly name = definition.name;
    public readonly description = definition.description;
    protected readonly config = config;

    protected override transformEntity(
      entity: EntityOf<AnyEntityDefinition>,
    ): unknown {
      return definition.transform(entity);
    }

    // Lists go through the declared `list` in fetch below, whose result the
    // caller's schema validates; the base class's own list path is unused.
    protected override buildListResult(): never {
      throw new Error(`Data source "${scopedId}" lists through fetch()`);
    }

    override async fetch<T>(
      query: unknown,
      outputSchema: DataSourceSchema<T>,
      context: BaseDataSourceContext,
    ): Promise<T> {
      const params = this.parseQuery(query);
      const entityService = context.entityService;

      if (!params.query.id) {
        const list = await this.fetchList(
          params.query,
          entityService,
          filterOptions(definition, params.query),
        );
        return outputSchema.parse(
          definition.list(list.items, list.pagination, params.query),
        );
      }

      const detail = definition.detail;
      if (!detail) {
        throw new Error(
          `Data source "${scopedId}" was queried for a single entity but declares no detail view`,
        );
      }
      // The sibling list is what navigation already loads; surfacing it lets
      // a detail view order its own neighbors.
      const [resolved, siblings] = await Promise.all([
        this.fetchDetail(params.query.id, entityService),
        this.fetchList(
          { limit: this.config.navigationLimit ?? 1000 },
          entityService,
        ),
      ]);
      return outputSchema.parse(
        await detail({
          item: resolved.item,
          navigation: resolved.navigation,
          siblings: siblings.items,
          entities: dataSourceEntityReader(entityService),
        }),
      );
    }
  }

  return new DeclarativeEntityDataSource(logger);
}

/** Bind either declared form to the runtime under its scoped id. */
export function createDeclaredDataSource(
  declaration: AnyDataSourceDeclaration,
  scopedId: string,
  logger: Logger,
): DataSource {
  return declaration.kind === "rizom-data-source"
    ? createFetchingDataSource(declaration, scopedId)
    : createEntityDataSource(declaration, scopedId, logger);
}
