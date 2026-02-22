import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { QueueManager } from "../queue-manager";
import type { RetryTracker } from "../retry-tracker";
import type { ContentScheduler } from "../scheduler";
import { PUBLISH_MESSAGES, GENERATE_MESSAGES } from "../types/messages";
import type {
  PublishRegisterPayload,
  PublishQueuePayload,
  PublishDirectPayload,
  PublishRemovePayload,
  PublishReorderPayload,
  PublishListPayload,
  PublishReportSuccessPayload,
  PublishReportFailurePayload,
  GenerateCompletedPayload,
  GenerateFailedPayload,
} from "../types/messages";
import type { ProviderRegistry } from "../provider-registry";

export interface MessageHandlerDeps {
  queueManager: QueueManager;
  providerRegistry: ProviderRegistry;
  retryTracker: RetryTracker;
  scheduler: ContentScheduler;
  logger: Logger;
}

/**
 * Subscribe to all publish and generation messages on the message bus.
 */
export function subscribeToMessages(
  context: ServicePluginContext,
  deps: MessageHandlerDeps,
): void {
  const { logger } = deps;

  context.messaging.subscribe<PublishRegisterPayload, { success: boolean }>(
    PUBLISH_MESSAGES.REGISTER,
    async (msg) => handleRegister(deps, msg.payload),
  );

  context.messaging.subscribe<PublishQueuePayload, { success: boolean }>(
    PUBLISH_MESSAGES.QUEUE,
    async (msg) => handleQueue(context, deps, msg.payload),
  );

  context.messaging.subscribe<PublishDirectPayload, { success: boolean }>(
    PUBLISH_MESSAGES.DIRECT,
    async (msg) => handleDirect(context, deps, msg.payload),
  );

  context.messaging.subscribe<PublishRemovePayload, { success: boolean }>(
    PUBLISH_MESSAGES.REMOVE,
    async (msg) => handleRemove(deps, msg.payload),
  );

  context.messaging.subscribe<PublishReorderPayload, { success: boolean }>(
    PUBLISH_MESSAGES.REORDER,
    async (msg) => handleReorder(deps, msg.payload),
  );

  context.messaging.subscribe<PublishListPayload, { success: boolean }>(
    PUBLISH_MESSAGES.LIST,
    async (msg) => handleList(context, deps, msg.payload),
  );

  context.messaging.subscribe<
    PublishReportSuccessPayload,
    { success: boolean }
  >(PUBLISH_MESSAGES.REPORT_SUCCESS, async (msg) =>
    handleReportSuccess(context, deps, msg.payload),
  );

  context.messaging.subscribe<
    PublishReportFailurePayload,
    { success: boolean }
  >(PUBLISH_MESSAGES.REPORT_FAILURE, async (msg) =>
    handleReportFailure(context, deps, msg.payload),
  );

  logger.debug("Subscribed to publish messages");

  context.messaging.subscribe<GenerateCompletedPayload, { success: boolean }>(
    GENERATE_MESSAGES.REPORT_SUCCESS,
    async (msg) => {
      const { entityType, entityId } = msg.payload;
      deps.scheduler.completeGeneration(entityType, entityId);
      logger.info("Generation completed", { entityType, entityId });
      return { success: true };
    },
  );

  context.messaging.subscribe<GenerateFailedPayload, { success: boolean }>(
    GENERATE_MESSAGES.REPORT_FAILURE,
    async (msg) => {
      const { entityType, error } = msg.payload;
      deps.scheduler.failGeneration(entityType, error);
      logger.warn("Generation failed", { entityType, error });
      return { success: true };
    },
  );

  logger.debug("Subscribed to generation messages");
}

async function handleRegister(
  deps: MessageHandlerDeps,
  payload: PublishRegisterPayload,
): Promise<{ success: boolean }> {
  const { entityType, provider } = payload;

  try {
    if (provider) {
      deps.providerRegistry.register(entityType, provider);
      deps.logger.info(`Registered provider for entity type: ${entityType}`, {
        providerName: provider.name,
      });
    }
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    deps.logger.error(`Failed to register provider: ${errorMessage}`);
    return { success: false };
  }
}

async function handleQueue(
  context: ServicePluginContext,
  deps: MessageHandlerDeps,
  payload: PublishQueuePayload,
): Promise<{ success: boolean }> {
  const { entityType, entityId } = payload;

  try {
    const result = await deps.queueManager.add(entityType, entityId);

    await context.messaging.send(PUBLISH_MESSAGES.QUEUED, {
      entityType,
      entityId,
      position: result.position,
    });

    deps.logger.debug(`Entity queued: ${entityId}`, {
      entityType,
      position: result.position,
    });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    deps.logger.error(`Failed to queue entity: ${errorMessage}`);
    return { success: false };
  }
}

async function handleDirect(
  context: ServicePluginContext,
  deps: MessageHandlerDeps,
  payload: PublishDirectPayload,
): Promise<{ success: boolean }> {
  const { entityType, entityId } = payload;

  await context.messaging.send(PUBLISH_MESSAGES.EXECUTE, {
    entityType,
    entityId,
  });

  deps.logger.debug(`Direct publish requested: ${entityId}`, { entityType });

  return { success: true };
}

async function handleRemove(
  deps: MessageHandlerDeps,
  payload: PublishRemovePayload,
): Promise<{ success: boolean }> {
  const { entityType, entityId } = payload;

  try {
    await deps.queueManager.remove(entityType, entityId);
    deps.logger.debug(`Entity removed from queue: ${entityId}`, {
      entityType,
    });
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    deps.logger.error(`Failed to remove entity: ${errorMessage}`);
    return { success: false };
  }
}

async function handleReorder(
  deps: MessageHandlerDeps,
  payload: PublishReorderPayload,
): Promise<{ success: boolean }> {
  const { entityType, entityId, position } = payload;

  try {
    await deps.queueManager.reorder(entityType, entityId, position);
    deps.logger.debug(`Entity reordered: ${entityId}`, {
      entityType,
      newPosition: position,
    });
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    deps.logger.error(`Failed to reorder entity: ${errorMessage}`);
    return { success: false };
  }
}

async function handleList(
  context: ServicePluginContext,
  deps: MessageHandlerDeps,
  payload: PublishListPayload,
): Promise<{ success: boolean }> {
  const { entityType } = payload;

  try {
    const queue = await deps.queueManager.list(entityType);

    await context.messaging.send(PUBLISH_MESSAGES.LIST_RESPONSE, {
      entityType,
      queue: queue.map((entry) => ({
        entityId: entry.entityId,
        position: entry.position,
        queuedAt: entry.queuedAt,
      })),
    });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    deps.logger.error(`Failed to list queue: ${errorMessage}`);
    return { success: false };
  }
}

async function handleReportSuccess(
  context: ServicePluginContext,
  deps: MessageHandlerDeps,
  payload: PublishReportSuccessPayload,
): Promise<{ success: boolean }> {
  const { entityType, entityId, result } = payload;

  deps.retryTracker.clearRetries(entityId);

  await context.messaging.send(PUBLISH_MESSAGES.COMPLETED, {
    entityType,
    entityId,
    result,
  });

  deps.logger.info(`Publish reported success: ${entityId}`, { entityType });

  return { success: true };
}

async function handleReportFailure(
  context: ServicePluginContext,
  deps: MessageHandlerDeps,
  payload: PublishReportFailurePayload,
): Promise<{ success: boolean }> {
  const { entityType, entityId, error } = payload;

  deps.retryTracker.recordFailure(entityId, error);
  const retryInfo = deps.retryTracker.getRetryInfo(entityId);

  await context.messaging.send(PUBLISH_MESSAGES.FAILED, {
    entityType,
    entityId,
    error,
    retryCount: retryInfo?.retryCount ?? 1,
    willRetry: retryInfo?.willRetry ?? false,
  });

  deps.logger.info(`Publish reported failure: ${entityId}`, {
    entityType,
    error,
    retryCount: retryInfo?.retryCount,
    willRetry: retryInfo?.willRetry,
  });

  return { success: true };
}
