import { getErrorMessage } from "@brains/utils/error";
import { getPublishBoundaryState } from "./publish-policy";
import type {
  BaseEntity,
  EntityMutationEventContext,
  EntityMutationResult,
  EntityServiceClient,
  EntityTypeConfig,
} from "./types";
import { canWriteVisibility, permissionToVisibilityScope } from "./visibility";

/** Who is editing, as far as an edit needs to know. */
export interface EntityEditCaller {
  readonly permission: "admin" | "trusted" | "public" | undefined;
}

/** The action an edit turns out to be, once the status change is known. */
export type EntityEditAction = "update" | "publish";

/**
 * One edit, as the caller means it.
 *
 * `next` is the entity as it should now be, not a patch. Patching a field is
 * an affordance of whoever is talking to an agent, and it stays with them —
 * along with deciding what an omitted visibility means, and with keeping the
 * metadata-backed top-level fields adapters serialize from in step with the
 * metadata itself.
 */
export interface EntityEditRequest {
  readonly entityType: string;
  readonly id: string;
  readonly next: BaseEntity;
  /**
   * The version the caller reviewed. Another writer — an agent, a git
   * import — may have touched the entity since; a different version stored
   * is a conflict, not something to overwrite. Omitted, no check is made.
   */
  readonly baseContentHash?: string | undefined;
  readonly eventContext?: EntityMutationEventContext | undefined;
}

/**
 * What became of an edit. Each caller renders these its own way — a 409
 * with the current hash for a console, an error string for a tool — and the
 * decision of which case it is belongs here.
 */
export type EntityEditOutcome =
  | {
      readonly kind: "updated";
      readonly action: EntityEditAction;
      readonly result: EntityMutationResult;
    }
  | { readonly kind: "not-found" }
  | { readonly kind: "conflict"; readonly currentContentHash: string }
  | {
      readonly kind: "denied";
      readonly reason: "entity-action-policy" | "visibility-policy";
      readonly message: string;
    };

/** What an edit asks of the runtime, and no more. */
export interface EntityEditServices {
  readonly entities: Pick<EntityServiceClient, "getEntity" | "updateEntity">;
  readonly registry: {
    getEntityTypeConfig(entityType: string): EntityTypeConfig;
  };
  /**
   * Whether this caller may take this action on this type. Throws with the
   * reason when not, which is how the permission service already answers;
   * taken as a callback so this depends on no permission package.
   */
  assertAllowed(
    entityType: string,
    action: EntityEditAction,
    permission: EntityEditCaller["permission"],
  ): void;
}

/**
 * Apply one edit to an entity, as somebody.
 *
 * The five steps every editor of a type it does not own has to take, in one
 * place: read at the caller's scope, notice a concurrent write, decide
 * whether the change crosses the publish boundary, ask the policy, and check
 * the visibility being written. The studio editor and the system update tool
 * each did all five; this is the one implementation both sit on.
 */
export async function applyEntityEdit(
  services: EntityEditServices,
  request: EntityEditRequest,
  caller: EntityEditCaller,
): Promise<EntityEditOutcome> {
  const existing = await services.entities.getEntity({
    entityType: request.entityType,
    id: request.id,
    visibilityScope: permissionToVisibilityScope(caller.permission),
  });
  if (!existing) return { kind: "not-found" };

  if (
    request.baseContentHash !== undefined &&
    request.baseContentHash !== existing.contentHash
  ) {
    return { kind: "conflict", currentContentHash: existing.contentHash };
  }

  const action = editAction(services.registry, existing, request);
  try {
    services.assertAllowed(request.entityType, action, caller.permission);
  } catch (error) {
    return {
      kind: "denied",
      reason: "entity-action-policy",
      message: getErrorMessage(error, `${action} is not allowed`),
    };
  }

  const { visibility } = request.next;
  if (
    visibility !== existing.visibility &&
    !canWriteVisibility(caller.permission, visibility)
  ) {
    return {
      kind: "denied",
      reason: "visibility-policy",
      message: `Cannot set entity visibility to "${visibility}" at ${caller.permission ?? "public"} permission.`,
    };
  }

  const result = await services.entities.updateEntity({
    entity: request.next,
    ...(request.eventContext
      ? { options: { eventContext: request.eventContext } }
      : {}),
  });
  return { kind: "updated", action, result };
}

/**
 * Whether this edit publishes. A status moving into the type's publish set
 * is a publish however the rest of the entity changed, and the policy asks
 * a different question about it.
 */
function editAction(
  registry: EntityEditServices["registry"],
  existing: BaseEntity,
  request: EntityEditRequest,
): EntityEditAction {
  const boundary = getPublishBoundaryState(
    request.entityType,
    existing.metadata["status"],
    request.next.metadata["status"],
    registry,
  );
  return boundary === "non-publish" ? "update" : "publish";
}
