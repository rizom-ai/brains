import { getErrorMessage } from "@brains/utils";
/**
 * Scheduler publish helpers - extracted from ContentScheduler
 *
 * Contains the publishing execution logic for both message mode
 * and provider mode.
 */

import type { IMessageBus, ICoreEntityService } from "@brains/plugins";
import type { QueueEntry } from "./queue-manager";
import type { ProviderRegistry } from "./provider-registry";
import type { RetryTracker } from "./retry-tracker";
import type { PublishEntityExecutor } from "./publish-executor";
import type {
  PublishExecuteEvent,
  PublishSuccessEvent,
  PublishFailedEvent,
} from "./types/scheduler";
import { PUBLISH_MESSAGES } from "./types/messages";

export interface PublishDeps {
  providerRegistry: ProviderRegistry;
  retryTracker: RetryTracker;
  messageBus?: IMessageBus | undefined;
  entityService?: ICoreEntityService | undefined;
  publishExecutor?: PublishEntityExecutor | undefined;
  onExecute?: ((event: PublishExecuteEvent) => void) | undefined;
  onPublish?: ((event: PublishSuccessEvent) => void) | undefined;
  onFailed?: ((event: PublishFailedEvent) => void) | undefined;
}

/**
 * Emit publish:execute message (message mode)
 */
export async function emitPublishExecute(
  entry: QueueEntry,
  deps: Pick<PublishDeps, "messageBus" | "onExecute">,
): Promise<void> {
  const event: PublishExecuteEvent = {
    entityType: entry.entityType,
    entityId: entry.entityId,
    authContext: entry.authContext,
  };

  if (deps.messageBus) {
    await deps.messageBus.send({
      type: PUBLISH_MESSAGES.EXECUTE,
      payload: event,
      sender: "publish-service",
    });
  }

  deps.onExecute?.(event);
}

/**
 * Execute publishing with provider (provider mode)
 */
export async function executeWithProvider(
  entry: QueueEntry,
  deps: Pick<
    PublishDeps,
    | "providerRegistry"
    | "retryTracker"
    | "entityService"
    | "publishExecutor"
    | "messageBus"
    | "onPublish"
    | "onFailed"
  >,
): Promise<void> {
  if (deps.publishExecutor) {
    await executeWithPublishExecutor(entry, deps);
    return;
  }

  const provider = deps.providerRegistry.get(entry.entityType);

  if (!deps.entityService) {
    deps.onFailed?.({
      entityType: entry.entityType,
      entityId: entry.entityId,
      error: "EntityService not available for provider mode",
      retryCount: 0,
      willRetry: false,
    });
    return;
  }

  const entity = await deps.entityService.getEntity({
    entityType: entry.entityType,
    id: entry.entityId,
  });

  if (!entity) {
    deps.onFailed?.({
      entityType: entry.entityType,
      entityId: entry.entityId,
      error: `Entity not found: ${entry.entityType}/${entry.entityId}`,
      retryCount: 0,
      willRetry: false,
    });
    return;
  }

  try {
    const result = await provider.publish(entity.content, entity.metadata);

    deps.retryTracker.clearRetries(entry.entityId);

    deps.onPublish?.({
      entityType: entry.entityType,
      entityId: entry.entityId,
      result,
    });
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    deps.retryTracker.recordFailure(entry.entityId, errorMessage);
    const retryInfo = deps.retryTracker.getRetryInfo(entry.entityId);

    deps.onFailed?.({
      entityType: entry.entityType,
      entityId: entry.entityId,
      error: errorMessage,
      retryCount: retryInfo?.retryCount ?? 1,
      willRetry: retryInfo?.willRetry ?? false,
    });
  }
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
      willRetry: retryInfo?.willRetry ?? false,
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
    willRetry: retryInfo?.willRetry ?? false,
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
