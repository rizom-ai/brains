import { actorRefKey, type ActorRef } from "@brains/contracts";
import type { ContentVisibility, EntityPluginContext } from "@brains/plugins";
import { ACTION_ITEM_ENTITY_TYPE } from "./constants";
import { applyMove, applyNote } from "./board";
import { createId } from "@brains/utils/id";
import { truncateText } from "@brains/utils/string-utils";
import { ActionItemAdapter } from "./adapter";
import {
  actionItemSchema,
  type ActionItemEntity,
  type ActionItemMetadata,
  type ActionItemSourceRef,
  type ActionItemStatus,
} from "./schema";

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
}

export type ActionItemMoveResult =
  | { status: "moved"; entity: ActionItemEntity }
  | { status: "conflict"; current: ActionItemStatus }
  | { status: "not-found" };

export interface ActionItemNoteRequest {
  id: string;
  text: string;
  /** The writer's name, as it appears on the note. */
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
      options: { expectedContentHash: entity.contentHash },
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

/** Move a card. A card someone else already moved is reported, never overridden. */
export async function moveActionItem(
  deps: ActionItemMoveDeps,
  request: ActionItemMoveRequest,
): Promise<ActionItemMoveResult> {
  const outcome = await writeActionItem(deps, request.id, (entity) =>
    entity.metadata.status === request.from
      ? applyMove(entity, { from: request.from, to: request.to })
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
  const outcome = await writeActionItem(deps, request.id, (entity, at) =>
    applyNote(entity, {
      text: request.text,
      actorName: request.actorName,
      at,
    }),
  );
  return outcome.status === "written" ? { status: "noted" } : outcome;
}

export interface TrackInboxItemDeps {
  entityService: Pick<
    EntityPluginContext["entityService"],
    "getEntity" | "createEntity"
  >;
  /** The visibility the brain gives action items. */
  visibility: ContentVisibility;
  now?: () => Date;
}

export interface TrackInboxItemRequest {
  sourceRef: ActionItemSourceRef;
  title: string;
  text: string;
  /** Who should do it, by name. */
  assignee?: string | undefined;
  actor: ActorRef;
  actorName?: string | undefined;
}

export type TrackInboxItemResult =
  { status: "tracked"; id: string } | { status: "already-tracked"; id: string };

const inboxItemAdapter = new ActionItemAdapter();

/** The card an Inbox item becomes; one per item. */
export function inboxCardId(sourceRef: ActionItemSourceRef): string {
  return `inbox:${sourceRef.sourceId}:${sourceRef.entityId}`;
}

/** Turn an Inbox item into an open card that points back at its source; once per item. */
export async function trackInboxItem(
  deps: TrackInboxItemDeps,
  request: TrackInboxItemRequest,
): Promise<TrackInboxItemResult> {
  const id = inboxCardId(request.sourceRef);
  const existing = await deps.entityService.getEntity({
    entityType: ACTION_ITEM_ENTITY_TYPE,
    id,
    visibilityScope: "restricted",
  });
  if (existing) return { status: "already-tracked", id };

  const assignee = request.assignee?.trim();
  const metadata: ActionItemMetadata = {
    origin: "inbox",
    sourceRef: request.sourceRef,
    capturedAt: (deps.now?.() ?? new Date()).toISOString(),
    status: "open",
    ...(assignee ? { assignedTo: [{ name: assignee }] } : {}),
    requestedBy: [
      {
        ...(request.actorName ? { name: request.actorName } : {}),
        id: actorRefKey(request.actor),
      },
    ],
  };
  const title = truncateText(request.title.replace(/\s+/g, " ").trim(), 80);
  await deps.entityService.createEntity({
    entity: {
      id,
      entityType: ACTION_ITEM_ENTITY_TYPE,
      visibility: deps.visibility,
      content: inboxItemAdapter.composeContent(
        `Action item: ${title}`,
        request.text.trim() || title,
        metadata,
      ),
      metadata,
    },
    options: { eventContext: { actor: request.actor } },
  });
  return { status: "tracked", id };
}

export interface CreateBoardCardRequest {
  title: string;
  text: string;
  /** Who should do it, by name. */
  assignee?: string | undefined;
  actor: ActorRef;
  actorName?: string | undefined;
}

export interface CreateBoardCardResult {
  status: "created";
  id: string;
}

/** Add an open card on the board by hand, naming who added it. */
export async function createBoardCard(
  deps: Omit<TrackInboxItemDeps, "entityService"> & {
    entityService: Pick<EntityPluginContext["entityService"], "createEntity">;
  },
  request: CreateBoardCardRequest,
): Promise<CreateBoardCardResult> {
  const id = `board:${createId()}`;
  const assignee = request.assignee?.trim();
  const metadata: ActionItemMetadata = {
    origin: "board",
    capturedAt: (deps.now?.() ?? new Date()).toISOString(),
    status: "open",
    ...(assignee ? { assignedTo: [{ name: assignee }] } : {}),
    requestedBy: [
      {
        ...(request.actorName ? { name: request.actorName } : {}),
        id: actorRefKey(request.actor),
      },
    ],
  };
  const title = truncateText(request.title.replace(/\s+/g, " ").trim(), 80);
  await deps.entityService.createEntity({
    entity: {
      id,
      entityType: ACTION_ITEM_ENTITY_TYPE,
      visibility: deps.visibility,
      content: inboxItemAdapter.composeContent(
        `Action item: ${title}`,
        request.text.trim() || title,
        metadata,
      ),
      metadata,
    },
    options: { eventContext: { actor: request.actor } },
  });
  return { status: "created", id };
}
