import { getErrorMessage } from "@brains/utils";
/**
 * Scheduler publish helpers - extracted from ContentScheduler
 *
 * Contains the provider publishing execution logic.
 */

import type { IMessageBus } from "@brains/plugins";
import type { QueueEntry } from "./queue-manager";
import type { RetryTracker } from "./retry-tracker";
import type { PublishEntityExecutor } from "./publish-executor";
import type {
  PublishSuccessEvent,
  PublishFailedEvent,
} from "./types/scheduler";
import { PUBLISH_MESSAGES } from "./types/messages";

export interface PublishDeps {
  retryTracker: RetryTracker;
  messageBus?: IMessageBus | undefined;
  publishExecutor?: Pick<PublishEntityExecutor, "publish"> | undefined;
  onPublish?: ((event: PublishSuccessEvent) => void) | undefined;
  onFailed?: ((event: PublishFailedEvent) => void) | undefined;
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
      const event = {
        entityType: entry.entityType,
        entityId: entry.entityId,
        error: publishResult.error,
        retryCount: 0,
        willRetry: false,
      };
      if (deps.messageBus) {
        await deps.messageBus.send({
          type: PUBLISH_MESSAGES.FAILED,
          payload: event,
          sender: "publish-service",
        });
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
    void deps.messageBus.send({
      type: PUBLISH_MESSAGES.COMPLETED,
      payload: { entityType, entityId, result },
      sender: "publish-service",
    });
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

  const event: PublishFailedEvent = {
    entityType,
    entityId,
    error,
    retryCount: retryInfo?.retryCount ?? 1,
    willRetry: false,
  };

  if (deps.messageBus) {
    void deps.messageBus.send({
      type: PUBLISH_MESSAGES.FAILED,
      payload: event,
      sender: "publish-service",
    });
  }

  deps.onFailed?.(event);
}
