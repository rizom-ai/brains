import type { ActorRef } from "@brains/contracts";
import type { ContentVisibility, EntityPluginContext } from "@brains/plugins";
import { ACTION_ITEM_ENTITY_TYPE } from "./constants";
import { applyMove, applyNote } from "./action-item-board";
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
  /** The writer's reach: a card they cannot read is a card they cannot change. */
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

export interface ActionItemNoteRequest {
  id: string;
  text: string;
  actor: ActorRef;
  actorName?: string | undefined;
}

export type ActionItemNoteResult =
  | { status: "noted" }
  | { status: "conflict"; current: ActionItemStatus }
  | { status: "not-found" };

type WriteOutcome =
  | { status: "written"; entity: ActionItemEntity }
  | { status: "conflict"; current: ActionItemStatus }
  | { status: "not-found" };

/**
 * The one way the board writes a card: read it, derive the change, and write
 * conditionally on the version read. An unrelated concurrent edit is
 * reapplied once; a change refused by the fresh card is reported.
 */
async function writeActionItem(
  deps: ActionItemMoveDeps,
  id: string,
  actor: ActorRef,
  change: (
    entity: ActionItemEntity,
    at: string,
  ) => ActionItemEntity | { refused: ActionItemStatus },
): Promise<WriteOutcome> {
  const attempt = async (attemptsLeft: number): Promise<WriteOutcome> => {
    const entity = await deps.entityService.getEntity(
      {
        entityType: ACTION_ITEM_ENTITY_TYPE,
        id,
        visibilityScope: deps.visibilityScope,
      },
      actionItemSchema,
    );
    if (!entity) return { status: "not-found" };
    const changed = change(entity, (deps.now?.() ?? new Date()).toISOString());
    if ("refused" in changed) {
      return { status: "conflict", current: changed.refused };
    }
    const result = await deps.entityService.updateEntity({
      entity: changed,
      options: {
        expectedContentHash: entity.contentHash,
        eventContext: { actor },
      },
    });
    if (result.skipReason !== "content-conflict") {
      return { status: "written", entity: changed };
    }
    return attemptsLeft > 1
      ? attempt(attemptsLeft - 1)
      : { status: "conflict", current: entity.metadata.status };
  };
  return attempt(2);
}

/**
 * Move a card through the one write path that records who moved it. A card
 * someone else already moved is reported, never overridden.
 */
export async function moveActionItem(
  deps: ActionItemMoveDeps,
  request: ActionItemMoveRequest,
): Promise<ActionItemMoveResult> {
  const outcome = await writeActionItem(
    deps,
    request.id,
    request.actor,
    (entity, at) =>
      entity.metadata.status === request.from
        ? applyMove(entity, {
            from: request.from,
            to: request.to,
            actor: request.actor,
            actorName: request.actorName,
            at,
          })
        : { refused: entity.metadata.status },
  );
  return outcome.status === "written"
    ? { status: "moved", entity: outcome.entity }
    : outcome;
}

/** Add one dated, named note to a card. */
export async function addActionItemNote(
  deps: ActionItemMoveDeps,
  request: ActionItemNoteRequest,
): Promise<ActionItemNoteResult> {
  const outcome = await writeActionItem(
    deps,
    request.id,
    request.actor,
    (entity, at) =>
      applyNote(entity, {
        text: request.text,
        actorName: request.actorName,
        at,
      }),
  );
  return outcome.status === "written" ? { status: "noted" } : outcome;
}
