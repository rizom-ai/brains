import type { ICoreEntityService } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { QueueManager } from "../queue-manager";

/**
 * Rebuild the publish queue from entities with status "queued".
 * Called after initial sync completes to restore queue state.
 */
export async function rebuildQueueFromEntities(
  entityService: ICoreEntityService,
  queueManager: QueueManager,
  logger: Logger,
): Promise<void> {
  const entityTypes = entityService.getEntityTypes();

  for (const entityType of entityTypes) {
    const entities = await entityService.listEntities(entityType, {
      filter: { metadata: { status: "queued" } },
    });
    for (const entity of entities) {
      await queueManager.add(entity.entityType, entity.id);
    }
  }

  let totalQueued = 0;
  for (const type of entityTypes) {
    const queued = await queueManager.list(type);
    totalQueued += queued.length;
  }

  if (totalQueued > 0) {
    logger.info(`Rebuilt queue with ${totalQueued} queued entities`);
  }
}
