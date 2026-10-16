import type { ServicePluginContext } from "@brains/plugins";
import { createId } from "@brains/plugins";
import { ENTITY_CHANNELS } from "@brains/contracts";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import type { RetryScope } from "@brains/utils/retry-backoff";
import type { DirectorySync } from "./directory-sync";
import type { DirectorySyncConfig, JobRequest } from "../types";
import type { DirectorySyncOperationStatusService } from "./directory-sync-operation-status";
import { getErrorMessage } from "@brains/utils/error";

const jobDataSchema = z.record(z.string(), z.unknown());

/**
 * Wake the durable export on every entity change in the runtime, including
 * those the worker makes (entity:created, entity:updated, entity:deleted).
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
    context.messaging.observe(event, async () => {
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
 *
 * A watched change is seen once, so a change the queue refuses (another
 * process holding its write lock) is kept: `retries`, owned by this sync
 * generation, enqueues it again until the queue admits it. The callback then
 * resolves undefined, and the run stays open until the retry settles.
 */
export function setupFileWatcher(
  context: ServicePluginContext,
  directorySync: Pick<DirectorySync, "setJobQueueCallback">,
  syncPath: string,
  operationStatus: DirectorySyncOperationStatusService | undefined,
  retries: RetryScope,
): void {
  directorySync.setJobQueueCallback(async (job: JobRequest) => {
    const runId = await operationStatus?.startRun("watcher", "importing");
    const operations = [
      {
        type: job.type,
        data: jobDataSchema.parse(job.data),
      },
    ];
    const rootJobId = createId();
    const enqueue = async (): Promise<string> => {
      const batchId = await context.jobs.enqueueBatch(operations, {
        priority: 5,
        source: "directory-sync-watcher",
        rootJobId,
        metadata: {
          operationType: "file_operations",
          operationTarget: syncPath,
          pluginId: "directory-sync",
        },
      });
      if (runId) await operationStatus?.attachBatch(runId, batchId);
      return batchId;
    };
    const failRun = async (error: unknown): Promise<void> => {
      if (!runId) return;
      await operationStatus?.failRun(
        runId,
        getErrorMessage(error, "Watcher import failed"),
        "import",
      );
    };

    try {
      return await enqueue();
    } catch (error) {
      void retries
        .retry(enqueue, error, `queue a watched ${job.type}`)
        .then(async (outcome) => {
          if (outcome.kind !== "succeeded") await failRun(error);
        })
        .catch((failure: unknown) => {
          // Recording the stopped run is best effort; the change itself was
          // already retried as far as this generation lived.
          context.logger.warn("Failed to record a stopped watcher run", {
            error: failure,
          });
        });
      return undefined;
    }
  });
}
