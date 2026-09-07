import { getErrorMessage } from "@brains/utils/error";
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
import type { EntityAction } from "@brains/templates";
import type { IShell } from "../interfaces";
import type { InterfaceCaller } from "../interface/route-contract";

/** A file somebody sent, as the console received it. */
export interface OperatorUploadRequest {
  readonly filename: string;
  readonly mediaType: string;
  readonly content: Buffer;
}

/** What became of an upload. */
export type OperatorUploadOutcome =
  | {
      readonly kind: "created";
      readonly entityType: string;
      readonly entityId: string | undefined;
      readonly jobId: string | undefined;
    }
  | {
      /** The owning type's handler took the file and said no. */
      readonly kind: "refused";
      readonly entityType: string;
      readonly message: string;
    }
  | {
      readonly kind: "denied";
      readonly reason: "unsupported-media-type";
      readonly message: string;
    }
  | {
      /** The type that takes this kind of file is one the caller may not create. */
      readonly kind: "denied";
      readonly reason: "entity-action-policy";
      readonly entityType: string;
      readonly message: string;
    };

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
    action: EntityAction,
    caller: InterfaceCaller,
  ): boolean;
  /**
   * Why this caller may not take this action on this type, in the policy's
   * own words — what a console shows the person it refused. Undefined when
   * they may.
   */
  refusal(
    entityType: string,
    action: EntityAction,
    caller: InterfaceCaller,
  ): string | undefined;
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
  /**
   * Turn a file into an entity of whichever type declared it takes that
   * kind of file. The console never decides what the file becomes: the
   * bytes are staged and handed to the type's own upload handler, as the
   * person who sent them. `createRouted`'s shape, for uploads.
   */
  upload(
    request: OperatorUploadRequest,
    caller: InterfaceCaller,
  ): Promise<OperatorUploadOutcome>;
}

export function createOperatorEntities(
  shell: IShell,
  options: {
    /** The declaring package, which is what an upload says it came through. */
    readonly interfaceType: string;
  },
): OperatorEntityWrites {
  const entityService = shell.getEntityService();
  const registry = shell.getEntityRegistry();
  const permissions = shell.getPermissionService();
  // Staged only for the moment between arriving and being promoted; the
  // record is never served back, so the path a served one would resolve
  // under is not a real one.
  const staging = shell.getRuntimeUploadRegistry().scoped({
    namespace: `${options.interfaceType}-upload`,
    refKind: "upload",
    routePath: "/",
  });

  const assertAllowed = (
    entityType: string,
    action: EntityEditAction | "create" | "delete",
    permission: InterfaceCaller["permission"] | undefined,
  ): void => {
    permissions.assertEntityActionAllowed(entityType, action, permission);
  };

  const refusal = (
    entityType: string,
    action: EntityAction,
    caller: InterfaceCaller,
  ): string | undefined => {
    try {
      permissions.assertEntityActionAllowed(
        entityType,
        action,
        caller.permission,
      );
      return undefined;
    } catch (error) {
      return getErrorMessage(error, `${action} is not allowed`);
    }
  };

  return {
    refusal,
    allows: (entityType, action, caller): boolean =>
      refusal(entityType, action, caller) === undefined,
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
    upload: async (request, caller): Promise<OperatorUploadOutcome> => {
      const registration = registry.getUploadSaveHandler(request.mediaType);
      if (!registration) {
        return {
          kind: "denied",
          reason: "unsupported-media-type",
          message: `No entity type accepts uploads of type ${request.mediaType}`,
        };
      }
      try {
        assertAllowed(registration.entityType, "create", caller.permission);
      } catch (error) {
        return {
          kind: "denied",
          reason: "entity-action-policy",
          entityType: registration.entityType,
          message: getErrorMessage(error, "create is not allowed"),
        };
      }
      const record = await staging.save({
        filename: request.filename,
        mediaType: request.mediaType,
        content: request.content,
      });
      // The bytes are staged only for the handler's moment with them. A
      // handler that refuses or crashes leaves nothing behind, and says so
      // as a refusal rather than a crash.
      let result: Awaited<ReturnType<typeof registration.handler>>;
      try {
        result = await registration.handler(
          { upload: { kind: "upload", id: record.id } },
          {
            interfaceType: options.interfaceType,
            actor: {
              kind: "user",
              userId: caller.actor.id,
              ...(caller.actor.canonicalId !== undefined
                ? { canonicalId: caller.actor.canonicalId }
                : {}),
            },
          },
        );
      } catch (error) {
        await staging.remove(record.id);
        return {
          kind: "refused",
          entityType: registration.entityType,
          message: getErrorMessage(error, "The upload could not be stored"),
        };
      }
      if (!result.success) {
        await staging.remove(record.id);
        return {
          kind: "refused",
          entityType: registration.entityType,
          message: result.error,
        };
      }
      return {
        kind: "created",
        entityType: registration.entityType,
        entityId: result.data.entityId,
        jobId: result.data.jobId,
      };
    },
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
