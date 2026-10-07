import { ENTITY_CHANNELS } from "@brains/contracts";
import {
  defineSubscription,
  type AnySubscriptionDefinition,
} from "@brains/sdk/services";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { getErrorMessage } from "@brains/utils/error";
import type { DirectorySyncHost } from "../host";
import { jobDefinitionFor } from "../jobs";
import type { DirectorySync } from "./directory-sync";
import type { DirectorySyncConfig, JobRequest } from "../types";
import type { DirectorySyncOperationStatusService } from "./directory-sync-operation-status";

const jobDataSchema = z.record(z.string(), z.unknown());

/**
 * Entity activity wakes the durable exporter. The event is only a wake-up:
 * the mutation itself is already durable in the entity service's export
 * outbox, so a lost delivery loses no work.
 */
export function entityActivitySubscriptions(
  scheduleDurableExport: () => void,
  logger: Logger,
  entityTypes: DirectorySyncConfig["entityTypes"],
): readonly AnySubscriptionDefinition[] {
  logger.debug("Setup durable entity-export wakeups", { entityTypes });
  return [
    ENTITY_CHANNELS.created,
    ENTITY_CHANNELS.updated,
    ENTITY_CHANNELS.deleted,
  ].map((topic) =>
    defineSubscription({
      topic,
      payload: z.unknown(),
      handle: () => {
        scheduleDurableExport();
        return {};
      },
    }),
  );
}

/**
 * Hook the DirectorySync file-watcher callback to the job queue so that
 * filesystem changes detected by the watcher are processed as jobs.
 */
export function setupFileWatcher(
  host: Pick<DirectorySyncHost, "jobs">,
  directorySync: DirectorySync,
  syncPath: string,
  operationStatus?: DirectorySyncOperationStatusService,
): void {
  directorySync.setJobQueueCallback(async (job: JobRequest) => {
    const runId = await operationStatus?.startRun("watcher", "importing");

    try {
      const batch = await host.jobs.enqueueBatch(
        [
          {
            definition: jobDefinitionFor(job.type),
            input: jobDataSchema.parse(job.data),
          },
        ],
        { priority: 5, operationTarget: syncPath },
      );
      if (runId) await operationStatus?.attachBatch(runId, batch.id);
      return batch.id;
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
