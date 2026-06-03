import type { BaseEntity, IEntityRegistry } from "@brains/entity-service";

export type PublishBoundaryState =
  | "boundary"
  | "within-publish-set"
  | "non-publish";

export function getPublishBoundaryState(
  entityType: string,
  oldStatus: unknown,
  newStatus: unknown,
  entityRegistry: IEntityRegistry,
): PublishBoundaryState {
  const publishStatuses =
    entityRegistry.getEntityTypeConfig(entityType).publish?.publishStatuses;
  if (!publishStatuses?.length) return "non-publish";
  if (typeof newStatus !== "string") return "non-publish";

  const oldIsPublish =
    typeof oldStatus === "string" && publishStatuses.includes(oldStatus);
  const newIsPublish = publishStatuses.includes(newStatus);

  if (!newIsPublish) return "non-publish";
  return oldIsPublish ? "within-publish-set" : "boundary";
}

export function getStatusAfterUpdate(
  entity: BaseEntity,
  updated: BaseEntity,
): { oldStatus: unknown; newStatus: unknown } {
  return {
    oldStatus: entity.metadata["status"],
    newStatus: updated.metadata["status"],
  };
}
