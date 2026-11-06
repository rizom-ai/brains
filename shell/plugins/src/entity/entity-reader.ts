import type {
  ContentVisibility,
  EntityServiceClient,
  SortField,
} from "@brains/entity-service";
import { definedFields } from "@brains/utils/strip-undefined";
import type {
  AnyEntityDefinition,
  DataSourceEntityReader,
  DataSourceListOptions,
  DataSourceSortField,
  EntityOf,
} from "./entity-definition-contract";
import { parseDefinitionEntity } from "./entity-schema";

export function sortFields(sort: readonly DataSourceSortField[]): SortField[] {
  return sort.map(({ field, direction, nullsFirst, nullsLast }) => ({
    field,
    direction,
    ...definedFields({ nullsFirst, nullsLast }),
  }));
}

/**
 * Definition-typed reads over an entity service. Without a scope they read
 * what the service reads by default — public records, through whatever
 * scoping the service itself applies; with one, they read up to it.
 */
export function createEntityReader(
  entityService: Pick<
    EntityServiceClient,
    "getEntity" | "listEntities" | "countEntities"
  >,
  visibilityScope?: ContentVisibility,
): DataSourceEntityReader {
  const scope = definedFields({ visibilityScope });
  return Object.freeze({
    async get<TDefinition extends AnyEntityDefinition>(
      definition: TDefinition,
      id: string,
    ): Promise<EntityOf<TDefinition> | null> {
      const entity = await entityService.getEntity({
        entityType: definition.type,
        id,
        ...scope,
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
          filter: visibilityScope && { visibilityScope },
        }),
      });
      return entities.map((entity) =>
        parseDefinitionEntity(definition, entity),
      );
    },
    count: (definition: AnyEntityDefinition): Promise<number> =>
      entityService.countEntities({
        entityType: definition.type,
        ...(visibilityScope && { options: { filter: { visibilityScope } } }),
      }),
  });
}
