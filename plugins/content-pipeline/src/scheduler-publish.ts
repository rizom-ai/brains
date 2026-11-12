import { getErrorMessage } from "@brains/utils/error";
/**
 * Scheduler publish helpers - extracted from ContentScheduler
 *
 * Contains the provider publishing execution logic.
 */

import type { SchedulerMessagePublisher } from "./types/scheduler";
import type { QueueEntry } from "./queue-manager";
import type { RetryTracker } from "./retry-tracker";
import type { PublishEntityExecutor } from "./publish-executor";
import type { PublishSuccessEvent } from "./types/scheduler";
import {
  publishCompletedChannel,
  publishFailedChannel,
  type PublishCompletedPayload,
  type PublishFailedPayload,
} from "@brains/contracts";

export interface PublishDeps {
  retryTracker: RetryTracker;
  messageBus?: SchedulerMessagePublisher | undefined;
  publishExecutor?: Pick<PublishEntityExecutor, "publish"> | undefined;
  onPublish?: ((event: PublishSuccessEvent) => void) | undefined;
  onFailed?: ((event: PublishFailedPayload) => void) | undefined;
}

/**
 * Execute publishing for a queued entry through the shared publish executor.
 */
export async function executeWithProvider(
  entry: QueueEntry,
  deps: Pick<
    PublishDeps,
    "retryTracker" | "publishExecutor" | "messageBus" | "onPublish" | "onFailed"
  >,
): Promise<void> {
  if (!deps.publishExecutor) {
    deps.onFailed?.({
      entityType: entry.entityType,
      entityId: entry.entityId,
      error: "Publish executor not configured",
      retryCount: 0,
      willRetry: false,
    });
    return;
  }

  await executeWithPublishExecutor(entry, deps);
}

async function executeWithPublishExecutor(
  entry: QueueEntry,
  deps: Pick<
    PublishDeps,
    "publishExecutor" | "retryTracker" | "messageBus" | "onPublish" | "onFailed"
  >,
): Promise<void> {
  if (!deps.publishExecutor) return;

  try {
    const publishResult = await deps.publishExecutor.publish({
      entityType: entry.entityType,
      id: entry.entityId,
    });

    if ("error" in publishResult) {
      const event: PublishFailedPayload = {
        entityType: entry.entityType,
        entityId: entry.entityId,
        error: publishResult.error,
        retryCount: 0,
        willRetry: false,
      };
      if (deps.messageBus) {
        await deps.messageBus.broadcast(publishFailedChannel, event);
      }
      deps.onFailed?.(event);
      return;
    }

    sendPublishCompleted(
      entry.entityType,
      entry.entityId,
      publishResult.result,
      deps,
    );
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    deps.retryTracker.recordFailure(entry.entityId, errorMessage);
    const retryInfo = deps.retryTracker.getRetryInfo(entry.entityId);

    deps.onFailed?.({
      entityType: entry.entityType,
      entityId: entry.entityId,
      error: errorMessage,
      retryCount: retryInfo?.retryCount ?? 1,
      willRetry: false,
    });
  }
}

/**
 * Report successful publish via message bus
 */
export function sendPublishCompleted(
  entityType: string,
  entityId: string,
  result: PublishSuccessEvent["result"],
  deps: Pick<PublishDeps, "retryTracker" | "messageBus" | "onPublish">,
): void {
  deps.retryTracker.clearRetries(entityId);

  if (deps.messageBus) {
    const payload: PublishCompletedPayload = { entityType, entityId, result };
    void deps.messageBus.broadcast(publishCompletedChannel, payload);
  }

  deps.onPublish?.({ entityType, entityId, result });
}

/**
 * Report failed publish via message bus
 */
export function sendPublishFailed(
  entityType: string,
  entityId: string,
  error: string,
  deps: Pick<PublishDeps, "retryTracker" | "messageBus" | "onFailed">,
): void {
  deps.retryTracker.recordFailure(entityId, error);
  const retryInfo = deps.retryTracker.getRetryInfo(entityId);

  const event: PublishFailedPayload = {
    entityType,
    entityId,
    error,
    retryCount: retryInfo?.retryCount ?? 1,
    willRetry: false,
  };

  if (deps.messageBus) {
    void deps.messageBus.broadcast(publishFailedChannel, event);
  }

  deps.onFailed?.(event);
}
