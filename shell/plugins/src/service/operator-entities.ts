import {
  applyEntityCreate,
  applyEntityDelete,
  applyEntityEdit,
  type EntityCreateOutcome,
  type EntityCreateRequest,
  type EntityDeleteOutcome,
  type EntityDeleteRequest,
  type EntityEditAction,
  type EntityEditOutcome,
  type EntityEditRequest,
} from "@brains/entity-service";
import type { IShell } from "../interfaces";
import type { InterfaceCaller } from "../interface/route-contract";

/**
 * Editing the brain's records on somebody's behalf.
 *
 * A package's own writes are scoped to the types it declares, because a job
 * has nobody it acts for: writing another package's material there would be
 * a package helping itself to it. A console is the other case. It declares
 * no types and edits them all, and it has a caller by construction — every
 * request carries an authenticated principal and the level the runtime
 * resolved for them.
 *
 * So this takes the caller on every call and asks the brain's own
 * entity-action policy from it. The console cannot forget the check and
 * cannot supply a level it was not given: a route declared
 * `security: { kind: "protocol" }` receives an `InterfaceCaller`, and a
 * public one receives `null`, so a surface with no caller cannot reach this
 * at all.
 *
 * Named consumer: @brains/studio.
 */
export interface OperatorEntityWrites {
  /**
   * Whether this caller may take this action on this type. A console renders
   * the buttons it will honour, so it asks before it draws them.
   */
  allows(
    entityType: string,
    action: EntityEditAction,
    caller: InterfaceCaller,
  ): boolean;
  /**
   * Store an entity the caller assembled. Narrower than the agent's create,
   * which chooses a source to derive from and runs a type's interceptor; a
   * console has a form and already has the entity.
   */
  create(
    request: EntityCreateRequest,
    caller: InterfaceCaller,
  ): Promise<EntityCreateOutcome>;
  /**
   * Write the entity as it should now be. What became of it comes back
   * described rather than thrown, because a console answers a conflict with
   * the current version and a refusal with the reason.
   */
  update(
    request: EntityEditRequest,
    caller: InterfaceCaller,
  ): Promise<EntityEditOutcome>;
  delete(
    request: EntityDeleteRequest,
    caller: InterfaceCaller,
  ): Promise<EntityDeleteOutcome>;
}

export function createOperatorEntities(shell: IShell): OperatorEntityWrites {
  const entityService = shell.getEntityService();
  const registry = shell.getEntityRegistry();
  const permissions = shell.getPermissionService();

  const assertAllowed = (
    entityType: string,
    action: EntityEditAction | "create" | "delete",
    permission: InterfaceCaller["permission"] | undefined,
  ): void => {
    permissions.assertEntityActionAllowed(entityType, action, permission);
  };

  return {
    allows: (entityType, action, caller): boolean =>
      permissions.canPerformEntityAction(caller.permission, entityType, action),
    create: (request, caller) =>
      applyEntityCreate(
        {
          entities: entityService,
          registry: {
            isRegistered: (entityType) => registry.hasEntityType(entityType),
          },
          assertAllowed,
        },
        request,
        { permission: caller.permission },
      ),
    update: (request, caller) =>
      applyEntityEdit(
        {
          entities: entityService,
          registry: {
            getEntityTypeConfig: (entityType) =>
              registry.getEntityTypeConfig(entityType),
          },
          assertAllowed,
        },
        request,
        { permission: caller.permission },
      ),
    delete: (request, caller) =>
      applyEntityDelete(
        {
          entities: entityService,
          registry: {
            isRegistered: (entityType) => registry.hasEntityType(entityType),
            // A registered type always has an adapter, so this answers
            // rather than throwing at a caller who named one.
            isSingleton: (entityType) =>
              registry.hasEntityType(entityType) &&
              registry.getAdapter(entityType).isSingleton === true,
          },
          assertAllowed,
        },
        request,
        { permission: caller.permission },
      ),
  };
}
