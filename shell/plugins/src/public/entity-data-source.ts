import type { JsonObject } from "@brains/contracts";
import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceRegistry,
  DataSourceSchema,
  ListOptions,
} from "@brains/entity-service";
import type { IRuntimeStateNamespace } from "@brains/runtime-state";
import type { Logger } from "@brains/utils/logger";
import { definedFields } from "@brains/utils/strip-undefined";
import { z } from "@brains/utils/zod";
import type {
  AnyDataSourceDeclaration,
  AnyEntityDataSourceDefinition,
  AnyEntityDefinition,
  DataSourceDefinition,
  DataSourceReadContext,
  EntityOf,
} from "../entity/entity-definition-contract";
import { createEntityReader, sortFields } from "../entity/entity-reader";
import { withDataSourceRuntime } from "../entity/entity-runtime";
import { entitySchema } from "../entity/entity-schema";
import { isSharedState, sharedStateNamespace } from "./shared-state";
import {
  attachSiteDataSourceRuntime,
  type SiteDataSourceRuntime,
} from "../site/site-data-source-runtime";
import {
  BaseEntityDataSource,
  type BaseQuery,
  type EntityDataSourceConfig,
} from "../service/base-entity-datasource";

export type {
  AnyDataSourceDeclaration,
  AnyEntityDataSourceDefinition,
  DataSourceDefinition,
  EntityReader,
  DataSourceListOptions,
  DataSourceQuery,
  DataSourceReadContext,
  DataSourceSortField,
  SharedStateReader,
  EntityDataSourceDefinition,
  EntityDataSourceInput,
  EntityDetailContext,
} from "../entity/entity-definition-contract";

export { defineDataSource } from "./define-data-source";

const dataSourceReadContextSchema = z.object({
  publishedOnly: z.boolean().optional(),
});

/** What the runtime gives a declared data source beyond its build's reads. */
export interface DataSourceBindings {
  /** `<package name>:<local id>`: what other packages' sources read it by. */
  readonly publicId: string;
  /** Where shared runtime-state records are read from. */
  readonly runtimeState: Pick<IRuntimeStateNamespace, "scoped">;
  /** Where other packages' sources are found. */
  readonly dataSources: Pick<DataSourceRegistry, "find">;
  /** A first-party site's runtime, built for each read it serves. */
  readonly siteRuntime?:
    ((context: BaseDataSourceContext) => SiteDataSourceRuntime) | undefined;
}

/**
 * The sources a build is already reading through one another, carried on the
 * build's context under a key nothing else names, so a read that would come
 * back to one of them is refused instead of recursing.
 */
const readChainKey = Symbol("data source read chain");
const readChainSchema = z.array(z.string());

function readChainOf(context: BaseDataSourceContext): readonly string[] {
  return readChainSchema.catch([]).parse(Reflect.get(context, readChainKey));
}

/** Other packages' sources, read at the build's context a fetch was given. */
function dataSourceReader(
  registry: DataSourceBindings["dataSources"],
  context: BaseDataSourceContext,
  readerId: string,
): DataSourceReadContext["dataSources"] {
  const chain = [...readChainOf(context), readerId];
  return Object.freeze({
    async fetch<TSchema extends z.ZodType>(
      source: `${string}:${string}`,
      query: unknown,
      schema: TSchema,
    ): Promise<z.output<TSchema> | null> {
      const [target] = registry.find(
        (dataSource) => dataSource.publicId === source,
      );
      if (!target?.fetch) return null;
      if (chain.includes(target.id)) {
        throw new Error(
          `Data source "${source}" is already being read by this build's chain, so reading it again would recurse`,
        );
      }
      // The build's own reads, with this source added to the chain.
      const nested: BaseDataSourceContext = Object.assign(
        { ...context },
        { [readChainKey]: chain },
      );
      // The source answers as it does for its own templates; the reader's
      // schema decides what the reader accepts.
      return schema.parse(await target.fetch(query, z.unknown(), nested));
    },
  });
}

/**
 * The read-only view of a shared record a data source is given: opened by
 * its `defineSharedState` declaration alone, never a storage namespace.
 */
export function sharedStateReader(
  runtimeState: DataSourceBindings["runtimeState"],
): DataSourceReadContext["sharedState"] {
  return (state) => {
    if (!isSharedState(state)) {
      throw new Error(
        "A data source reads only shared state declared with defineSharedState",
      );
    }
    const store = runtimeState.scoped({
      namespace: sharedStateNamespace(state.name),
      schema: state.schema,
    });
    return Object.freeze({ get: (key: string) => store.get(key) });
  };
}

/** Bind a declared fetching data source to the runtime under its scoped id. */
function createFetchingDataSource(
  definition: DataSourceDefinition,
  scopedId: string,
  bindings: DataSourceBindings,
): DataSource {
  const sharedState = sharedStateReader(bindings.runtimeState);
  return {
    id: scopedId,
    publicId: bindings.publicId,
    name: definition.name,
    description: definition.description,
    async fetch<T>(
      query: unknown,
      outputSchema: DataSourceSchema<T>,
      context: BaseDataSourceContext,
    ): Promise<T> {
      // First-party sources reach untyped reads at the build's own scope
      // through entityRuntime(context).
      const read = {
        ...dataSourceReadContextSchema.parse(
          definedFields({ publishedOnly: context.publishedOnly }),
        ),
        sharedState,
        dataSources: dataSourceReader(bindings.dataSources, context, scopedId),
      };
      if (bindings.siteRuntime) {
        attachSiteDataSourceRuntime(read, bindings.siteRuntime(context));
      }
      const readContext: DataSourceReadContext = withDataSourceRuntime(
        read,
        context.entityService,
      );
      return outputSchema.parse(
        await definition.fetch(
          query,
          createEntityReader(context.entityService),
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
  publicId: string,
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
    public readonly publicId = publicId;
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
        await detail(
          // First-party detail views reach untyped reads at the build's
          // scope through entityRuntime(context), as a fetching source does.
          withDataSourceRuntime(
            {
              item: resolved.item,
              navigation: resolved.navigation,
              siblings: siblings.items,
              entities: createEntityReader(entityService),
            },
            entityService,
          ),
        ),
      );
    }
  }

  return new DeclarativeEntityDataSource(logger);
}

/**
 * Whether a value is a fetching source as `defineDataSource` declares one:
 * what a site's `dataSources` carry without a brain to type them.
 */
export function isFetchingDataSourceDeclaration(
  value: unknown,
): value is DataSourceDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    Reflect.get(value, "kind") === "rizom-data-source" &&
    typeof Reflect.get(value, "id") === "string" &&
    typeof Reflect.get(value, "name") === "string" &&
    typeof Reflect.get(value, "description") === "string" &&
    typeof Reflect.get(value, "fetch") === "function"
  );
}

/** Bind either declared form to the runtime under its scoped id. */
export function createDeclaredDataSource(
  declaration: AnyDataSourceDeclaration,
  scopedId: string,
  logger: Logger,
  bindings: DataSourceBindings,
): DataSource {
  return declaration.kind === "rizom-data-source"
    ? createFetchingDataSource(declaration, scopedId, bindings)
    : createEntityDataSource(declaration, scopedId, bindings.publicId, logger);
}
