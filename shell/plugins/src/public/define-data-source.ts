import type {
  AnyDataSourceDeclaration,
  AnyEntityDefinition,
  DataSourceDefinition,
  EntityDataSourceDefinition,
  EntityDataSourceInput,
  EntityOf,
} from "../entity/entity-definition-contract";
import type { JsonObject } from "@brains/contracts";
import { assertIdentifier as assertLocalId } from "../package-definition";

// Apart from the runtime binding (./entity-data-source), so a site that
// bundles its declarations carries no runtime.
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
