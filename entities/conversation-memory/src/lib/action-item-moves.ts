import type { ActorRef } from "@brains/contracts";
import type { ContentVisibility, EntityPluginContext } from "@brains/plugins";
import { ACTION_ITEM_ENTITY_TYPE } from "./constants";
import { applyMove } from "./action-item-board";
import {
  actionItemSchema,
  type ActionItemEntity,
  type ActionItemStatus,
} from "../schemas/conversation-memory";

export interface ActionItemMoveDeps {
  entityService: Pick<
    EntityPluginContext["entityService"],
    "getEntity" | "updateEntity"
  >;
  /** The mover's reach: a card they cannot read is a card they cannot move. */
  visibilityScope: ContentVisibility;
  now?: () => Date;
}

export interface ActionItemMoveRequest {
  id: string;
  /** The status the mover saw on the card. */
  from: ActionItemStatus;
  to: ActionItemStatus;
  actor: ActorRef;
  actorName?: string | undefined;
}

export type ActionItemMoveResult =
  | { status: "moved"; entity: ActionItemEntity }
  | { status: "conflict"; current: ActionItemStatus }
  | { status: "not-found" };

/**
 * Move a card through the one write path that records who moved it. The write
 * is conditional on the version read; an unrelated concurrent edit is
 * reapplied once, but a card someone else already moved is reported, never
 * overridden.
 */
export async function moveActionItem(
  deps: ActionItemMoveDeps,
  request: ActionItemMoveRequest,
): Promise<ActionItemMoveResult> {
  const attempt = async (
    attemptsLeft: number,
  ): Promise<ActionItemMoveResult> => {
    const entity = await deps.entityService.getEntity(
      {
        entityType: ACTION_ITEM_ENTITY_TYPE,
        id: request.id,
        visibilityScope: deps.visibilityScope,
      },
      actionItemSchema,
    );
    if (!entity) return { status: "not-found" };
    if (entity.metadata.status !== request.from) {
      return { status: "conflict", current: entity.metadata.status };
    }
    const moved = applyMove(entity, {
      from: request.from,
      to: request.to,
      actor: request.actor,
      actorName: request.actorName,
      at: (deps.now?.() ?? new Date()).toISOString(),
    });
    const result = await deps.entityService.updateEntity({
      entity: moved,
      options: {
        expectedContentHash: entity.contentHash,
        eventContext: { actor: request.actor },
      },
    });
    if (result.skipReason !== "content-conflict") {
      return { status: "moved", entity: moved };
    }
    return attemptsLeft > 1
      ? attempt(attemptsLeft - 1)
      : { status: "conflict", current: entity.metadata.status };
  };
  return attempt(2);
}
