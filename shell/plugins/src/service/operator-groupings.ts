import {
  permissionToVisibilityScope,
  queryGroupingCatalogSchema,
  queryGroupingMembersSchema,
  type EntityGrouping,
  type EntityGroupingCatalog,
  type EntityGroupingMembers,
  type QueryGroupingCatalogRequest,
  type QueryGroupingMembersRequest,
} from "@brains/entity-service";
import { assertRouteCaller } from "../internal/route-caller-authority";
import { SdkError } from "@brains/contracts";
import { operatorRead } from "./operator-validation";
import type { IShell } from "../interfaces";
import type { InterfaceCaller } from "../interface/route-contract";

/** Named consumer: Studio. Every data read is bound to the resolved caller. */
export interface OperatorEntityGroupings {
  ready(): boolean;
  /** Static authoring shape trait; does not read records or memberships. */
  contributes(entityType: string): boolean;
  definitions(caller: InterfaceCaller): Promise<EntityGrouping[]>;
  catalog(
    request: Omit<QueryGroupingCatalogRequest, "visibilityScope">,
    caller: InterfaceCaller,
  ): Promise<EntityGroupingCatalog>;
  members(
    request: Omit<QueryGroupingMembersRequest, "visibilityScope">,
    caller: InterfaceCaller,
  ): Promise<EntityGroupingMembers>;
}

export function createOperatorGroupings(
  shell: IShell,
): OperatorEntityGroupings {
  const entities = shell.getEntityService();
  const registry = shell.getEntityRegistry();
  const permissions = shell.getPermissionService();
  const admitted = async (
    types: readonly string[],
    caller: InterfaceCaller,
    signal?: AbortSignal,
  ): Promise<string[]> => {
    const result: string[] = [];
    for (const entityType of types) {
      signal?.throwIfAborted();
      const count = await entities.countEntities({
        entityType,
        options: {
          filter: {
            visibilityScope: permissionToVisibilityScope(caller.permission),
          },
        },
      });
      const mayAct = (
        ["create", "update", "delete", "extract", "publish"] as const
      ).some((action) =>
        permissions.canPerformEntityAction(
          caller.permission,
          entityType,
          action,
        ),
      );
      if (count > 0 || mayAct) result.push(entityType);
    }
    signal?.throwIfAborted();
    return result;
  };
  const queryTypes = async (
    grouping: string,
    requested: readonly string[],
    caller: InterfaceCaller,
    signal?: AbortSignal,
  ): Promise<string[]> => {
    const definition = registry
      .getGroupings()
      .find((item) => item.key === grouping);
    if (!definition) throw new SdkError("not_found");
    const types = await admitted(definition.types, caller, signal);
    if (!types.length) throw new SdkError("not_found");
    return types.filter((type) => requested.includes(type));
  };
  const capability: OperatorEntityGroupings = {
    ready: (): boolean => entities.areGroupingsReady(),
    contributes: (type): boolean => registry.isGroupingContributor(type),
    definitions: (caller: InterfaceCaller): Promise<EntityGrouping[]> =>
      operatorRead(async () => {
        assertRouteCaller(caller, shell.getAuthRegistry());
        const result: EntityGrouping[] = [];
        for (const definition of registry.getGroupings()) {
          const types = await admitted(definition.types, caller);
          if (types.length)
            result.push({ ...structuredClone(definition), types });
        }
        return result;
      }),
    catalog: (request, caller) =>
      operatorRead(async () => {
        assertRouteCaller(caller, shell.getAuthRegistry());
        const input = queryGroupingCatalogSchema.parse({
          ...request,
          visibilityScope: permissionToVisibilityScope(caller.permission),
        });
        return entities.queryGroupingCatalog({
          ...input,
          entityTypes: await queryTypes(
            input.grouping,
            input.entityTypes,
            caller,
            input.signal,
          ),
        });
      }, request.signal),
    members: (request, caller) =>
      operatorRead(async () => {
        assertRouteCaller(caller, shell.getAuthRegistry());
        const input = queryGroupingMembersSchema.parse({
          ...request,
          visibilityScope: permissionToVisibilityScope(caller.permission),
        });
        return entities.queryGroupingMembers({
          ...input,
          entityTypes: await queryTypes(
            input.grouping,
            input.entityTypes,
            caller,
            input.signal,
          ),
        });
      }, request.signal),
  };
  return Object.freeze(capability);
}
