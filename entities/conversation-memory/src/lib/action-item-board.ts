import type { ActorRef } from "@brains/contracts";
import { computeContentHash } from "@brains/utils/hash";
import {
  generateMarkdown,
  readMarkdownFrontmatter,
} from "@brains/utils/markdown-frontmatter";
import {
  actionItemMetadataSchema,
  type ActionItemEntity,
  type ActionItemHistoryEntry,
  type ActionItemStatus,
} from "../schemas/conversation-memory";

/** Frontmatter keys the action-item schema owns; any other key is an extension such as a grouping. */
const OWNED_FIELDS: ReadonlySet<string> = new Set(
  Object.keys(actionItemMetadataSchema.shape),
);

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
  actor: ActorRef;
  /** The mover's name as the signed-in surface knows it. */
  actorName?: string | undefined;
  at: string;
}

function frontmatterFields(content: string): Record<string, unknown> {
  const { data } = readMarkdownFrontmatter(content);
  return typeof data === "object" && data !== null
    ? Object.fromEntries(Object.entries(data))
    : {};
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
  if (fields.some((field) => !OWNED_FIELDS.has(field))) return true;
  const projected = entity.metadata.projectedBodyHash;
  return (
    projected !== undefined && actionItemBodyHash(entity.content) !== projected
  );
}

/** Set status and record the change; the body and every other field stay as stored. */
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
  const entry: ActionItemHistoryEntry = {
    at: move.at,
    actor: move.actor,
    ...(move.actorName ? { displayName: move.actorName } : {}),
    from: move.from,
    to: move.to,
  };
  const history = [...(entity.metadata.history ?? []), entry];
  const content = generateMarkdown(
    { ...frontmatterFields(entity.content), status: move.to, history },
    actionItemBody(entity.content),
  );
  return {
    ...entity,
    content,
    contentHash: computeContentHash(content),
    metadata: { ...entity.metadata, status: move.to, history },
  };
}

/** The card title: the item heading without its `Action item:` prefix. */
export function actionItemTitle(entity: ActionItemEntity): string {
  const heading = entity.content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const title = heading?.replace(/^Action item:\s*/, "");
  return title !== undefined && title.length > 0 ? title : entity.id;
}

/** The move that last brought a card into a status. */
export function lastArrival(
  entity: ActionItemEntity,
  status: ActionItemStatus,
): ActionItemHistoryEntry | undefined {
  return [...(entity.metadata.history ?? [])]
    .reverse()
    .find((entry) => entry.to === status);
}

/** When a card last arrived in a status, from its history. */
export function arrivedAt(
  entity: ActionItemEntity,
  status: ActionItemStatus,
): string | undefined {
  return lastArrival(entity, status)?.at;
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
  const content = generateMarkdown(frontmatterFields(entity.content), next);
  return { ...entity, content, contentHash: computeContentHash(content) };
}
