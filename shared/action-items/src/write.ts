import { actorRefKey, type ActorRef } from "@brains/contracts";
import type { ContentVisibility, EntityPluginContext } from "@brains/plugins";
import { ACTION_ITEM_ENTITY_TYPE } from "./constants";
import {
  actionItemAssigneeHash,
  actionItemBodyHash,
  applyMove,
  applyNote,
  isBoardOwned,
} from "./board";
import { createShortId } from "@brains/utils/id";
import {
  slugify,
  truncateSlug,
  truncateText,
} from "@brains/utils/string-utils";
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

export interface WithdrawActionItemDeps {
  entityService: Pick<
    EntityPluginContext["entityService"],
    "getEntity" | "deleteEntity"
  >;
  visibilityScope: ContentVisibility;
}

export interface WithdrawActionItemResult {
  status: "removed" | "kept" | "not-found";
}

/**
 * Take back a card its finder wrote. A card the board has touched is kept:
 * the delete holds only while the card is the version read, and a refused
 * delete is decided again from the fresh card.
 */
export async function withdrawActionItem(
  deps: WithdrawActionItemDeps,
  id: string,
  attempts = 2,
): Promise<WithdrawActionItemResult> {
  const entity = await deps.entityService.getEntity(
    {
      entityType: ACTION_ITEM_ENTITY_TYPE,
      id,
      visibilityScope: deps.visibilityScope,
    },
    actionItemSchema,
  );
  if (!entity) return { status: "not-found" };
  if (isBoardOwned(entity)) return { status: "kept" };
  const deleted = await deps.entityService.deleteEntity({
    entityType: ACTION_ITEM_ENTITY_TYPE,
    id,
    options: { expectedContentHash: entity.contentHash },
  });
  if (deleted) return { status: "removed" };
  return attempts > 1
    ? withdrawActionItem(deps, id, attempts - 1)
    : { status: "kept" };
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

/** A brain member a card is assigned to: its name and its actor key. */
export interface ActionItemAssigneeMember {
  name: string;
  /** `user:<id>`, the key the brain's actors use. */
  id: string;
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
  /** The member who should do it. */
  assignee?: ActionItemAssigneeMember | undefined;
  actor: ActorRef;
  actorName?: string | undefined;
}

export type TrackInboxItemResult =
  { status: "tracked"; id: string } | { status: "already-tracked"; id: string };

const inboxItemAdapter = new ActionItemAdapter();

/**
 * Parts joined into one id without colons: directory sync stores a colon in
 * an id as a folder, and each card is one flat file.
 */
export function flatId(...parts: string[]): string {
  return parts.join("-").replaceAll(":", "-");
}

/** The card an Inbox item becomes; one per item. */
export function inboxCardId(sourceRef: ActionItemSourceRef): string {
  return flatId("inbox", sourceRef.sourceId, sourceRef.entityId);
}

/** A hand-added card's id: its title as a slug and a short unique suffix. */
export function boardCardId(
  title: string,
  suffix: string = createShortId(),
): string {
  return `${truncateSlug(slugify(title), 60) || "card"}-${suffix}`;
}

/** Turn an Inbox item into an open card that points back at its source; once per item. */
export async function trackInboxItem(
  deps: TrackInboxItemDeps,
  request: TrackInboxItemRequest,
): Promise<TrackInboxItemResult> {
  const { sourceRef, ...card } = request;
  const result = await createActionItem(deps, {
    ...card,
    id: inboxCardId(sourceRef),
    origin: { kind: "inbox", sourceRef },
  });
  return result.status === "created"
    ? { status: "tracked", id: result.id }
    : { status: "already-tracked", id: result.id };
}

/**
 * Where a card comes from: added on the board by hand, tracked from an Inbox
 * item, or asked for or found in a conversation, which it then names.
 */
export type CreateActionItemOrigin =
  | { kind: "board" }
  | { kind: "inbox"; sourceRef: ActionItemSourceRef }
  | {
      kind: "conversation";
      conversationId: string;
      interfaceType: string;
      channelId: string;
      channelName?: string | undefined;
    };

export interface CreateActionItemRequest {
  title: string;
  text: string;
  /** The member who should do it. */
  assignee?: ActionItemAssigneeMember | undefined;
  actor: ActorRef;
  actorName?: string | undefined;
  origin: CreateActionItemOrigin;
  /** A card found in a conversation keeps the id it was found by. */
  id?: string | undefined;
  /**
   * Written by the channel pickup, which may still revise it: its body hash
   * is stored, so any later edit makes it the board's.
   */
  projected?: boolean | undefined;
}

export interface CreateActionItemResult {
  /** "exists" when a card with the requested id is already there. */
  status: "created" | "exists";
  id: string;
}

function originMetadata(
  origin: CreateActionItemOrigin,
): Pick<
  ActionItemMetadata,
  | "origin"
  | "conversationId"
  | "interfaceType"
  | "channelId"
  | "channelName"
  | "sourceRef"
> {
  if (origin.kind === "board") return { origin: "board" };
  if (origin.kind === "inbox") {
    return { origin: "inbox", sourceRef: origin.sourceRef };
  }
  return {
    origin: "conversation",
    conversationId: origin.conversationId,
    interfaceType: origin.interfaceType,
    channelId: origin.channelId,
    ...(origin.channelName ? { channelName: origin.channelName } : {}),
  };
}

/** Add an open card someone asked for, naming who asked and where. */
export async function createActionItem(
  deps: Omit<TrackInboxItemDeps, "entityService"> & {
    entityService: Pick<
      EntityPluginContext["entityService"],
      "createEntity" | "getEntity"
    >;
  },
  request: CreateActionItemRequest,
): Promise<CreateActionItemResult> {
  const title = truncateText(request.title.replace(/\s+/g, " ").trim(), 80);
  const id = request.id ?? boardCardId(title);
  if (
    request.id !== undefined &&
    (await deps.entityService.getEntity({
      entityType: ACTION_ITEM_ENTITY_TYPE,
      id,
      visibilityScope: "restricted",
    }))
  ) {
    return { status: "exists", id };
  }
  const assignee = request.assignee;
  const metadata: ActionItemMetadata = {
    ...originMetadata(request.origin),
    capturedAt: (deps.now?.() ?? new Date()).toISOString(),
    status: "open",
    ...(assignee
      ? { assignedTo: [{ name: assignee.name, id: assignee.id }] }
      : {}),
    requestedBy: [
      {
        ...(request.actorName ? { name: request.actorName } : {}),
        id: actorRefKey(request.actor),
      },
    ],
  };
  const text = request.text.trim() || title;
  const card = request.projected
    ? foundCard(title, text, metadata)
    : {
        content: inboxItemAdapter.composeContent(
          `Action item: ${title}`,
          text,
          metadata,
        ),
        metadata,
      };
  await deps.entityService.createEntity({
    entity: {
      id,
      entityType: ACTION_ITEM_ENTITY_TYPE,
      visibility: deps.visibility,
      ...card,
    },
    options: { eventContext: { actor: request.actor } },
  });
  return { status: "created", id };
}

/**
 * A card as its finder writes it, with the hashes of its body and owner, so
 * a later change by anyone else gives it to the board.
 */
function foundCard(
  title: string,
  text: string,
  metadata: ActionItemMetadata,
): { content: string; metadata: ActionItemMetadata } {
  const heading = `Action item: ${title}`;
  const {
    projectedBodyHash: _body,
    projectedAssigneeHash: _owner,
    ...rest
  } = metadata;
  const stored: ActionItemMetadata = {
    ...rest,
    projectedBodyHash: actionItemBodyHash(
      inboxItemAdapter.composeContent(heading, text, rest),
    ),
    projectedAssigneeHash: actionItemAssigneeHash(rest.assignedTo),
  };
  return {
    content: inboxItemAdapter.composeContent(heading, text, stored),
    metadata: stored,
  };
}

export interface ReviseActionItemDeps {
  entityService: Pick<
    EntityPluginContext["entityService"],
    "getEntity" | "updateEntity"
  >;
  visibilityScope: ContentVisibility;
}

export interface ReviseActionItemRequest {
  id: string;
  title: string;
  text: string;
  /** The owner now; none takes the card's owner away. */
  assignee: ActionItemAssigneeMember | undefined;
}

export interface ReviseActionItemResult {
  status: "revised" | "unchanged" | "kept" | "not-found";
}

/**
 * Rewrite a card its finder wrote, when later messages change it. A card the
 * board has touched is kept: the write holds only while the card is the
 * version read, and a refused write is decided again from the fresh card.
 */
export async function reviseActionItem(
  deps: ReviseActionItemDeps,
  request: ReviseActionItemRequest,
  attempts = 2,
): Promise<ReviseActionItemResult> {
  const entity = await deps.entityService.getEntity(
    {
      entityType: ACTION_ITEM_ENTITY_TYPE,
      id: request.id,
      visibilityScope: deps.visibilityScope,
    },
    actionItemSchema,
  );
  if (!entity) return { status: "not-found" };
  if (isBoardOwned(entity)) return { status: "kept" };
  const { assignedTo: _assignedTo, ...unassigned } = entity.metadata;
  const title = truncateText(request.title.replace(/\s+/g, " ").trim(), 80);
  const revised = foundCard(title, request.text.trim() || title, {
    ...unassigned,
    ...(request.assignee
      ? {
          assignedTo: [
            { name: request.assignee.name, id: request.assignee.id },
          ],
        }
      : {}),
  });
  if (
    revised.metadata.projectedBodyHash === actionItemBodyHash(entity.content) &&
    revised.metadata.projectedAssigneeHash ===
      actionItemAssigneeHash(entity.metadata.assignedTo)
  ) {
    return { status: "unchanged" };
  }
  const result = await deps.entityService.updateEntity({
    entity: { ...entity, ...revised },
    options: { expectedContentHash: entity.contentHash },
  });
  if (result.skipReason !== "content-conflict") return { status: "revised" };
  return attempts > 1
    ? reviseActionItem(deps, request, attempts - 1)
    : { status: "kept" };
}
