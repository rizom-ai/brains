import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import { createId } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import type { DirectorySync } from "./directory-sync";
import { unlink, access } from "fs/promises";
import type { DirectorySyncConfig, JobRequest } from "../types";
import type { DirectorySyncOperationStatusService } from "./directory-sync-operation-status";

const jobDataSchema = z.record(z.string(), z.unknown());

/**
 * Subscribe to entity CRUD events and mirror changes to the filesystem
 * in real time (entity:created, entity:updated, entity:deleted).
 */
export function setupAutoSync(
  context: ServicePluginContext,
  getDirectorySync: () => DirectorySync,
  logger: Logger,
  entityTypes: DirectorySyncConfig["entityTypes"],
  operationStatus?: DirectorySyncOperationStatusService,
): void {
  const { subscribe } = context.messaging;
  const { entityService } = context;

  subscribe<{ entity: BaseEntity; entityType: string; entityId: string }>(
    "entity:created",
    async (message) => {
      const { entity } = message.payload;

      try {
        await getDirectorySync().fileOps.writeEntity(entity);
        logger.debug("Auto-exported created entity", {
          id: entity.id,
          entityType: entity.entityType,
        });
        await operationStatus?.clearIssues(["export"]);
      } catch (error) {
        logger.error("Auto-export FAILED for created entity", {
          id: entity.id,
          entityType: entity.entityType,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        await operationStatus?.recordIssue({
          kind: "export",
          path: `${entity.entityType}/${entity.id}.md`,
          message:
            error instanceof Error ? error.message : "Entity export failed",
        });
      }
      return { success: true };
    },
  );

  // Fetch current entity from DB instead of using event payload to avoid stale data
  subscribe<{ entity: BaseEntity; entityType: string; entityId: string }>(
    "entity:updated",
    async (message) => {
      const { entityType, entityId } = message.payload;

      try {
        const currentEntity = await entityService.getEntity({
          entityType: entityType,
          id: entityId,
        });
        if (!currentEntity) {
          logger.debug("Entity not found in DB, skipping export", {
            entityType,
            entityId,
          });
          return { success: false };
        }

        await getDirectorySync().fileOps.writeEntity(currentEntity);
        logger.debug("Auto-exported updated entity", {
          id: currentEntity.id,
          entityType: currentEntity.entityType,
        });
        await operationStatus?.clearIssues(["export"]);
      } catch (error) {
        logger.error("Auto-export FAILED for updated entity", {
          entityType,
          entityId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        await operationStatus?.recordIssue({
          kind: "export",
          path: `${entityType}/${entityId}.md`,
          message:
            error instanceof Error ? error.message : "Entity export failed",
        });
      }
      return { success: true };
    },
  );

  subscribe<{ entityId: string; entityType: string }>(
    "entity:deleted",
    async (message) => {
      const { entityId, entityType } = message.payload;

      const filePath = getDirectorySync().fileOps.getFilePath(
        entityId,
        entityType,
      );
      const exists = await access(filePath).then(
        () => true,
        () => false,
      );
      if (exists) {
        await unlink(filePath);
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
  operationStatus?: DirectorySyncOperationStatusService,
): void {
  directorySync.setJobQueueCallback(async (job: JobRequest) => {
    const runId = await operationStatus?.startRun("watcher", "importing");
    const operations = [
      {
        type: job.type,
        data: jobDataSchema.parse(job.data),
      },
    ];

    try {
      const batchId = await context.jobs.enqueueBatch(operations, {
        priority: 5,
        source: "directory-sync-watcher",
        rootJobId: createId(),
        metadata: {
          operationType: "file_operations",
          operationTarget: syncPath,
          pluginId: "directory-sync",
        },
      });
      if (runId) await operationStatus?.attachBatch(runId, batchId);
      return batchId;
    } catch (error) {
      if (runId) {
        await operationStatus?.failRun(
          runId,
          error instanceof Error ? error.message : "Watcher import failed",
          "import",
        );
      }
      throw error;
    }
  });
}
