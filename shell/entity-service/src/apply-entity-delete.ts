import { getErrorMessage } from "@brains/utils/error";
import type { EntityEditCaller } from "./apply-entity-edit";
import type { EntityMutationEventContext, EntityServiceClient } from "./types";
import { permissionToVisibilityScope } from "./visibility";

/** One entity to remove, and on whose behalf. */
export interface EntityDeleteRequest {
  readonly entityType: string;
  readonly id: string;
  readonly eventContext?: EntityMutationEventContext | undefined;
}

/** What became of a delete. */
export type EntityDeleteOutcome =
  | { readonly kind: "deleted" }
  | { readonly kind: "not-found" }
  | {
      readonly kind: "denied";
      readonly reason: "unknown-type" | "singleton" | "entity-action-policy";
      readonly message: string;
    };

/** What a delete asks of the runtime, and no more. */
export interface EntityDeleteServices {
  readonly entities: Pick<EntityServiceClient, "getEntity" | "deleteEntity">;
  readonly registry: {
    isRegistered(entityType: string): boolean;
    isSingleton(entityType: string): boolean;
  };
  assertAllowed(
    entityType: string,
    action: "delete",
    permission: EntityEditCaller["permission"],
  ): void;
}

/**
 * Remove one entity, as somebody.
 *
 * The console and the system tool both did this, and only the tool refused a
 * singleton — so a console could delete the brain's one identity record where
 * a tool would not. One implementation is how that stops being true of
 * whichever caller was written second.
 */
export async function applyEntityDelete(
  services: EntityDeleteServices,
  request: EntityDeleteRequest,
  caller: EntityEditCaller,
): Promise<EntityDeleteOutcome> {
  const existing = await services.entities.getEntity({
    entityType: request.entityType,
    id: request.id,
    visibilityScope: permissionToVisibilityScope(caller.permission),
  });
  if (!existing) return { kind: "not-found" };

  // Asked before the registry is, which would otherwise throw its own
  // "No adapter registered" string at whoever named a type that does not
  // exist.
  if (!services.registry.isRegistered(request.entityType)) {
    return {
      kind: "denied",
      reason: "unknown-type",
      message: `Unknown entity type: ${request.entityType}`,
    };
  }

  if (services.registry.isSingleton(request.entityType)) {
    return {
      kind: "denied",
      reason: "singleton",
      message: `${request.entityType} is a singleton entity and cannot be deleted. Update it instead.`,
    };
  }

  try {
    services.assertAllowed(request.entityType, "delete", caller.permission);
  } catch (error) {
    return {
      kind: "denied",
      reason: "entity-action-policy",
      message: getErrorMessage(error, "delete is not allowed"),
    };
  }

  await services.entities.deleteEntity({
    entityType: request.entityType,
    id: existing.id,
    ...(request.eventContext
      ? { options: { eventContext: request.eventContext } }
      : {}),
  });
  return { kind: "deleted" };
}
