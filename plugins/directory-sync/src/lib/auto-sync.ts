import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import { createId } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { DirectorySync } from "./directory-sync";
import type { DirectorySyncConfig, JobRequest } from "../types";

/**
 * Subscribe to entity CRUD events and mirror changes to the filesystem
 * in real time (entity:created, entity:updated, entity:deleted).
 */
export function setupAutoSync(
  context: ServicePluginContext,
  directorySync: DirectorySync,
  logger: Logger,
  entityTypes: DirectorySyncConfig["entityTypes"],
): void {
  const { subscribe } = context.messaging;
  const { entityService } = context;

  subscribe<{ entity: BaseEntity; entityType: string; entityId: string }>(
    "entity:created",
    async (message) => {
      const { entity } = message.payload;

      await directorySync.fileOps.writeEntity(entity);
      logger.debug("Auto-exported created entity", {
        id: entity.id,
        entityType: entity.entityType,
      });
      return { success: true };
    },
  );

  // Fetch current entity from DB instead of using event payload to avoid stale data
  subscribe<{ entity: BaseEntity; entityType: string; entityId: string }>(
    "entity:updated",
    async (message) => {
      const { entityType, entityId } = message.payload;

      const currentEntity = await entityService.getEntity(entityType, entityId);
      if (!currentEntity) {
        logger.debug("Entity not found in DB, skipping export", {
          entityType,
          entityId,
        });
        return { success: false };
      }

      await directorySync.fileOps.writeEntity(currentEntity);
      logger.debug("Auto-exported updated entity", {
        id: currentEntity.id,
        entityType: currentEntity.entityType,
      });
      return { success: true };
    },
  );

  subscribe<{ entityId: string; entityType: string }>(
    "entity:deleted",
    async (message) => {
      const { entityId, entityType } = message.payload;

      const filePath = directorySync.fileOps.getFilePath(entityId, entityType);
      const { unlinkSync, existsSync } = await import("fs");

      if (existsSync(filePath)) {
        unlinkSync(filePath);
        logger.debug("Auto-deleted entity file", {
          id: entityId,
          entityType,
          path: filePath,
        });
      }
      return { success: true };
    },
  );

  logger.debug("Setup auto-sync for entity events", { entityTypes });
}

/**
 * Hook the DirectorySync file-watcher callback to the job queue so that
 * filesystem changes detected by the watcher are processed as jobs.
 */
export function setupFileWatcher(
  context: ServicePluginContext,
  directorySync: DirectorySync,
  syncPath: string,
): void {
  directorySync.setJobQueueCallback(async (job: JobRequest) => {
    const operations = [
      {
        type: job.type,
        data: job.data as Record<string, unknown>,
      },
    ];

    return context.jobs.enqueueBatch(operations, {
      priority: 5,
      source: "directory-sync-watcher",
      rootJobId: createId(),
      metadata: {
        operationType: "file_operations",
        operationTarget: syncPath,
        pluginId: "directory-sync",
      },
    });
  });
}
