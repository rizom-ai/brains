import { getErrorMessage } from "@brains/utils/error";
import {
  parseLinkedInUploadEvidence,
  type LinkedInUploadEvidence,
} from "@brains/contracts";
/**
 * Scheduler publish helpers - extracted from ContentScheduler
 *
 * Contains the provider publishing execution logic.
 */

import type { SchedulerMessagePublisher } from "./types/scheduler";
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
  messageBus?: SchedulerMessagePublisher | undefined;
  publishExecutor?: Pick<PublishEntityExecutor, "publish"> | undefined;
  onPublish?: ((event: PublishSuccessEvent) => void) | undefined;
  onFailed?: ((event: PublishFailedEvent) => void | Promise<void>) | undefined;
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
    await deps.onFailed?.({
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

  let publishResult: Awaited<ReturnType<PublishEntityExecutor["publish"]>>;
  try {
    publishResult = await deps.publishExecutor.publish({
      entityType: entry.entityType,
      id: entry.entityId,
    });
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    deps.retryTracker.recordFailure(entry.entityId, errorMessage);
    const retryInfo = deps.retryTracker.getRetryInfo(entry.entityId);

    await deps.onFailed?.({
      entityType: entry.entityType,
      entityId: entry.entityId,
      error: errorMessage,
      retryCount: retryInfo?.retryCount ?? 1,
      willRetry: false,
    });
    return;
  }
  // Reporting failures are not new provider failures and must not replay callbacks.
  if ("error" in publishResult) {
    const event: PublishFailedEvent = {
      entityType: entry.entityType,
      entityId: entry.entityId,
      error: publishResult.error,
      retryCount: 0,
      willRetry: false,
    };
    if (deps.messageBus)
      await deps.messageBus.send({
        type: PUBLISH_MESSAGES.FAILED,
        payload: event,
        sender: "publish-service",
        broadcast: true,
      });
    await deps.onFailed?.(event);
    return;
  }
  sendPublishCompleted(
    entry.entityType,
    entry.entityId,
    publishResult.result,
    deps,
  );
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
      broadcast: true,
    });
  }

  deps.onPublish?.({ entityType, entityId, result });
}

/**
 * Report failed publish via message bus
 */
export async function sendPublishFailed(
  entityType: string,
  entityId: string,
  error: string,
  deps: Pick<PublishDeps, "retryTracker" | "messageBus" | "onFailed">,
  recovery?: LinkedInUploadEvidence,
): Promise<void> {
  const evidence =
    recovery === undefined ? undefined : parseLinkedInUploadEvidence(recovery);
  deps.retryTracker.recordFailure(entityId, error);
  const retryInfo = deps.retryTracker.getRetryInfo(entityId);

  const event: PublishFailedEvent = {
    entityType,
    entityId,
    error,
    retryCount: retryInfo?.retryCount ?? 1,
    willRetry: false,
    ...(evidence && { recovery: evidence }),
  };
  Object.freeze(event);

  const failures: unknown[] = [];
  try {
    if (deps.messageBus)
      await deps.messageBus.send({
        type: PUBLISH_MESSAGES.FAILED,
        payload: event,
        sender: "publish-service",
        broadcast: true,
      });
  } catch (error) {
    failures.push(error);
  }
  try {
    await deps.onFailed?.(event);
  } catch (error) {
    failures.push(error);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(
      failures,
      "Publish failure reporting sinks failed",
      { cause: failures[0] },
    );
}
