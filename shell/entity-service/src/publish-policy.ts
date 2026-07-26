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
