import { getErrorMessage } from "@brains/utils/error";
import type { EntityEditCaller } from "./apply-entity-edit";
import type {
  BaseEntity,
  EntityInput,
  EntityMutationEventContext,
  EntityServiceClient,
} from "./types";
import { canWriteVisibility, normalizeContentVisibility } from "./visibility";

/** An entity somebody assembled and wants stored. */
export interface EntityCreateRequest {
  readonly entityType: string;
  readonly entity: EntityInput<BaseEntity>;
  readonly eventContext?: EntityMutationEventContext | undefined;
}

/** What became of a create. */
export type EntityCreateOutcome =
  | {
      readonly kind: "created";
      readonly entityId: string;
      readonly jobId: string;
    }
  | {
      readonly kind: "denied";
      readonly reason:
        "unknown-type" | "entity-action-policy" | "visibility-policy";
      readonly message: string;
    };

/** What a create asks of the runtime, and no more. */
export interface EntityCreateServices {
  readonly entities: Pick<EntityServiceClient, "createEntity">;
  readonly registry: {
    isRegistered(entityType: string): boolean;
  };
  assertAllowed(
    entityType: string,
    action: "create",
    permission: EntityEditCaller["permission"],
  ): void;
}

/**
 * Store an entity somebody assembled, as them.
 *
 * Deliberately narrower than the system create tool, which is mostly
 * affordances for an agent: choosing a source to derive from, preserving an
 * upload, running a type's create interceptor, asking for confirmation. A
 * console has already assembled the entity from a form. What the two share
 * is these three guards and the write, so that is what this is — forcing the
 * rest together would unify two things that only look alike from far away.
 */
export async function applyEntityCreate(
  services: EntityCreateServices,
  request: EntityCreateRequest,
  caller: EntityEditCaller,
): Promise<EntityCreateOutcome> {
  if (!services.registry.isRegistered(request.entityType)) {
    return {
      kind: "denied",
      reason: "unknown-type",
      message: `Unknown entity type: ${request.entityType}`,
    };
  }

  try {
    services.assertAllowed(request.entityType, "create", caller.permission);
  } catch (error) {
    return {
      kind: "denied",
      reason: "entity-action-policy",
      message: getErrorMessage(error, "create is not allowed"),
    };
  }

  // A draft that names no visibility takes the store default, which the
  // caller is by definition allowed to write.
  const named = request.entity.visibility;
  const visibility =
    named === undefined ? undefined : normalizeContentVisibility(named);
  if (
    visibility !== undefined &&
    !canWriteVisibility(caller.permission, visibility)
  ) {
    return {
      kind: "denied",
      reason: "visibility-policy",
      message: `Cannot set entity visibility to "${visibility}" at ${caller.permission ?? "public"} permission.`,
    };
  }

  const result = await services.entities.createEntity({
    entity: request.entity,
    ...(request.eventContext
      ? { options: { eventContext: request.eventContext } }
      : {}),
  });
  return {
    kind: "created",
    entityId: result.entityId,
    jobId: result.jobId,
  };
}
