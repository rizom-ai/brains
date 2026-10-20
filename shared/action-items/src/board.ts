import { computeContentHash } from "@brains/utils/hash";
import {
  generateMarkdown,
  readMarkdownFrontmatter,
} from "@brains/utils/markdown-frontmatter";
import { CONVERSATION_SUMMARY_ENTITY_TYPE } from "./constants";
import { channelLabel } from "./format";
import {
  ACTION_ITEM_RETIRED_FIELDS,
  ACTION_ITEM_TRANSLATED_FIELDS,
} from "./stored-shape";
import {
  actionItemMetadataSchema,
  actionItemOrigin,
  type ActionItemEntity,
  type ActionItemStatus,
} from "./schema";

/** Frontmatter keys the action-item schema owns; any other key is an extension such as a grouping. */
const OWNED_FIELDS: ReadonlySet<string> = new Set(
  Object.keys(actionItemMetadataSchema.shape),
);
const RETIRED_FIELDS: ReadonlySet<string> = new Set([
  ...ACTION_ITEM_RETIRED_FIELDS,
  ...ACTION_ITEM_TRANSLATED_FIELDS,
]);

/** A card's status moved underneath the person moving it. */
export class StaleActionItemStatusError extends Error {
  public readonly current: ActionItemStatus;
  public readonly expected: ActionItemStatus;

  constructor(current: ActionItemStatus, expected: ActionItemStatus) {
    super(`Action item is ${current}, not ${expected}`);
    this.name = "StaleActionItemStatusError";
    this.current = current;
    this.expected = expected;
  }
}

export interface ActionItemMove {
  /** The status the person saw on the card. */
  from: ActionItemStatus;
  to: ActionItemStatus;
}

function frontmatterFields(content: string): Record<string, unknown> {
  const { data } = readMarkdownFrontmatter(content);
  return typeof data === "object" && data !== null
    ? Object.fromEntries(Object.entries(data))
    : {};
}

/**
 * The frontmatter a write produces: the owned fields from parsed metadata,
 * in their current shape, then every extension (a grouping) as stored.
 * Retired fields are not written back.
 */
export function actionItemFrontmatter(
  entity: ActionItemEntity,
): Record<string, unknown> {
  const owned = Object.entries(entity.metadata).filter(
    ([, value]) => value !== undefined,
  );
  const extensions = Object.entries(frontmatterFields(entity.content)).filter(
    ([key]) => !OWNED_FIELDS.has(key) && !RETIRED_FIELDS.has(key),
  );
  return Object.fromEntries([...owned, ...extensions]);
}

/** The markdown body after the frontmatter, untrimmed. */
export function actionItemBody(content: string): string {
  return readMarkdownFrontmatter(content).content;
}

export function actionItemBodyHash(content: string): string {
  return computeContentHash(actionItemBody(content));
}

/**
 * Once anything but the projector has written an item it belongs to the board,
 * and re-projection must neither delete nor overwrite it. Read from stored
 * content alone, so the answer survives export and import.
 */
export function isBoardOwned(entity: ActionItemEntity): boolean {
  if (entity.metadata.status !== "open") return true;
  const fields = Object.keys(frontmatterFields(entity.content));
  if (
    fields.some(
      (field) => !OWNED_FIELDS.has(field) && !RETIRED_FIELDS.has(field),
    )
  )
    return true;
  const projected = entity.metadata.projectedBodyHash;
  return (
    projected !== undefined && actionItemBodyHash(entity.content) !== projected
  );
}

/** Set status; the body and every other field stay as stored. */
export function applyMove(
  entity: ActionItemEntity,
  move: ActionItemMove,
): ActionItemEntity {
  const current = entity.metadata.status;
  if (current !== move.from) {
    throw new StaleActionItemStatusError(current, move.from);
  }
  if (move.to === move.from) {
    throw new Error(`Action item is already ${move.to}`);
  }
  const content = generateMarkdown(
    { ...actionItemFrontmatter(entity), status: move.to },
    actionItemBody(entity.content),
  );
  return {
    ...entity,
    content,
    contentHash: computeContentHash(content),
    metadata: { ...entity.metadata, status: move.to },
  };
}

/** The card title: the item heading without its `Action item:` prefix. */
export function actionItemTitle(entity: ActionItemEntity): string {
  const heading = entity.content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const title = heading?.replace(/^Action item:\s*/, "");
  return title !== undefined && title.length > 0 ? title : entity.id;
}

export interface ActionItemNote {
  text: string;
  /** The writer's name as the signed-in surface knows it. */
  actorName?: string | undefined;
  at: string;
}

/**
 * Append one dated, named line under the body's Notes section, creating the
 * section once. Earlier body text and every frontmatter field stay as stored.
 */
export function applyNote(
  entity: ActionItemEntity,
  note: ActionItemNote,
): ActionItemEntity {
  const text = note.text.replace(/\s+/g, " ").trim();
  if (text.length === 0) throw new Error("A note needs text");
  const line = `- ${note.at.slice(0, 10)} · ${note.actorName ?? "A team member"} — ${text}\n`;
  const body = actionItemBody(entity.content);
  const ended = body.endsWith("\n") ? body : `${body}\n`;
  const next = /^## Notes$/m.test(body)
    ? `${ended}${line}`
    : `${ended}\n## Notes\n\n${line}`;
  const content = generateMarkdown(actionItemFrontmatter(entity), next);
  return { ...entity, content, contentHash: computeContentHash(content) };
}

/** When an item was captured: its conversation's end, or when it was tracked. */
export function actionItemCapturedAt(entity: ActionItemEntity): string {
  return actionItemOrigin(entity.metadata).capturedAt;
}

export interface ActionItemSource {
  /** Where the item came from, in a word: its channel, the Inbox, or the Board. */
  place: string;
  /** The entity it came from; a card added on the board has none. */
  link?: { label: string; entityType: string; entityId: string };
}

export function actionItemSource(entity: ActionItemEntity): ActionItemSource {
  const origin = actionItemOrigin(entity.metadata);
  if (origin.kind === "board") return { place: "Board" };
  return origin.kind === "conversation"
    ? {
        place: channelLabel(origin.channelName, origin.channelId),
        link: {
          label: "Conversation summary",
          entityType: CONVERSATION_SUMMARY_ENTITY_TYPE,
          // A conversation's summary has the conversation's id.
          entityId: origin.conversationId,
        },
      }
    : {
        place: "Inbox",
        link: {
          label: "Inbox source",
          entityType: origin.sourceRef.entityType,
          entityId: origin.sourceRef.entityId,
        },
      };
}
