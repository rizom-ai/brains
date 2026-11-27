import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import type { EntityTypeConfig } from "./types";

interface EntityTypeConfigProvider {
  getEntityTypeConfig(entityType: string): EntityTypeConfig;
}

export type PublishBoundaryState =
  "boundary" | "within-publish-set" | "non-publish";

/**
 * Classify whether an entity update enters or remains in a configured publish
 * status. Callers use this shared boundary to choose update vs publish policy.
 */
export function getPublishBoundaryState(
  entityType: string,
  oldStatus: unknown,
  newStatus: unknown,
  entityRegistry: EntityTypeConfigProvider,
): PublishBoundaryState {
  const publishStatuses =
    entityRegistry.getEntityTypeConfig(entityType).publish?.publishStatuses;
  if (!publishStatuses?.length || typeof newStatus !== "string") {
    return "non-publish";
  }

  const oldIsPublish =
    typeof oldStatus === "string" && publishStatuses.includes(oldStatus);
  const newIsPublish = publishStatuses.includes(newStatus);
  if (!newIsPublish) return "non-publish";
  return oldIsPublish ? "within-publish-set" : "boundary";
}

/** An action a write to an existing entity may need permission for. */
export type EntityWriteAction = "update" | "publish";

/** What of an entity a write states: its document, its fields and who reads it. */
export interface WrittenEntityState {
  readonly content: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly visibility?: unknown;
}

const STATUS_FIELD = "status";

/** A record's fields other than its status, in an order that does not depend on the file's. */
function fieldsBesideStatus(fields: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(
    Object.entries(fields)
      .filter(([key]) => key !== STATUS_FIELD)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

/** A document's header and body; one with a header that does not read is all body. */
function documentParts(content: string): {
  header: Readonly<Record<string, unknown>>;
  body: string;
} {
  try {
    const parsed = parseMarkdown(content);
    return { header: parsed.frontmatter, body: parsed.content.trim() };
  } catch {
    // Compared as it is written: a change to it is still a change.
    return { header: {}, body: content.trim() };
  }
}

/**
 * Whether a write changes anything of an entity besides its status: its
 * body, another field of its header or its metadata, or who may read it.
 */
export function changesBesideStatus(
  before: WrittenEntityState,
  after: WrittenEntityState,
): boolean {
  if (before.visibility !== after.visibility) return true;
  if (
    fieldsBesideStatus(before.metadata) !== fieldsBesideStatus(after.metadata)
  )
    return true;
  const was = documentParts(before.content);
  const is = documentParts(after.content);
  return (
    was.body !== is.body ||
    fieldsBesideStatus(was.header) !== fieldsBesideStatus(is.header)
  );
}

/**
 * What a write to an existing entity needs permission for. A write that
 * leaves the entity outside its publish statuses is an update. One that
 * publishes it, or writes it while published, is a publish, and an update as
 * well when it changes anything besides the status: permission to publish is
 * not permission to edit, so a type nobody may update is published as it
 * stands.
 */
export function requiredUpdateActions(
  entityType: string,
  before: WrittenEntityState,
  after: WrittenEntityState,
  entityRegistry: EntityTypeConfigProvider,
): EntityWriteAction[] {
  const boundary = getPublishBoundaryState(
    entityType,
    before.metadata[STATUS_FIELD],
    after.metadata[STATUS_FIELD],
    entityRegistry,
  );
  return updateActionsAt(boundary, () => changesBesideStatus(before, after));
}

/**
 * The actions a write needs at its publish boundary, for a caller that knows
 * the write only as an operation: whether it changes anything besides the
 * status is asked only where it matters.
 */
export function updateActionsAt(
  boundary: PublishBoundaryState,
  changesBeside: () => boolean,
): EntityWriteAction[] {
  if (boundary === "non-publish") return ["update"];
  return changesBeside() ? ["publish", "update"] : ["publish"];
}
