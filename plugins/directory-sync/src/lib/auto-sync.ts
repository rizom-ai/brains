import type { ServicePluginContext } from "@brains/plugins";
import { createId } from "@brains/plugins";
import { ENTITY_CHANNELS } from "@brains/contracts";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import type { DirectorySync } from "./directory-sync";
import type { DirectorySyncConfig, JobRequest } from "../types";
import type { DirectorySyncOperationStatusService } from "./directory-sync-operation-status";
import { getErrorMessage } from "@brains/utils/error";

const jobDataSchema = z.record(z.string(), z.unknown());

/**
 * Subscribe to entity CRUD events and mirror changes to the filesystem
 * in real time (entity:created, entity:updated, entity:deleted).
 */
export function setupAutoSync(
  context: ServicePluginContext,
  scheduleDurableExport: () => void,
  logger: Logger,
  entityTypes: DirectorySyncConfig["entityTypes"],
  _operationStatus?: DirectorySyncOperationStatusService,
): void {
  for (const event of [
    ENTITY_CHANNELS.created,
    ENTITY_CHANNELS.updated,
    ENTITY_CHANNELS.deleted,
  ]) {
    context.messaging.subscribe(event, async () => {
      // The event is only a wake-up. The mutation itself is already durable in
      // Entity Service's export outbox, so losing this delivery loses no work.
      scheduleDurableExport();
      return { success: true };
    });
  }

  logger.debug("Setup durable entity-export wakeups", { entityTypes });
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
          getErrorMessage(error, "Watcher import failed"),
          "import",
        );
      }
      throw error;
    }
  });
}
