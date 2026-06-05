import { getErrorMessage } from "@brains/utils";
import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { QueueManager } from "../queue-manager";
import type { RetryTracker } from "../retry-tracker";
import type { ContentScheduler } from "../scheduler";
import {
  publishableMetadataSchema,
  type PublishableMetadata,
} from "../schemas/publishable";
import {
  PUBLISH_MESSAGES,
  GENERATE_MESSAGES,
  PUBLISH_ASSET_MESSAGES,
  SYSTEM_PUBLISH_AUTH_CONTEXT,
} from "../types/messages";
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
  PublishAssetRegisterPayload,
} from "../types/messages";
import type { ProviderRegistry } from "../provider-registry";
import type { PublishEntityExecutor } from "../publish-executor";
import type { PublishAssetRegistry } from "../publish-assets";
import { publishAssetDefinitionSchema } from "../publish-assets";
import type { PublishAssetPreflight } from "../publish-asset-preflight";
import { publishConfigSchema } from "../types/config";

export interface MessageHandlerDeps {
  queueManager: QueueManager;
  providerRegistry: ProviderRegistry;
  retryTracker: RetryTracker;
  publishExecutor: PublishEntityExecutor;
  publishAssetRegistry: PublishAssetRegistry;
  publishAssetPreflight: PublishAssetPreflight;
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
  subscribeToPublishMessages(context, deps);
  subscribeToGenerationMessages(context, deps);
  subscribeToPublishAssetMessages(context, deps);
  subscribeToEntityChangeMessages(context, deps);
}

function subscribeToPublishMessages(
  context: ServicePluginContext,
  deps: MessageHandlerDeps,
): void {
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
    handleReportSuccess(deps, msg.payload),
  );

  context.messaging.subscribe<
    PublishReportFailurePayload,
    { success: boolean }
  >(PUBLISH_MESSAGES.REPORT_FAILURE, async (msg) =>
    handleReportFailure(deps, msg.payload),
  );

  deps.logger.debug("Subscribed to publish messages");
}

function subscribeToGenerationMessages(
  context: ServicePluginContext,
  deps: MessageHandlerDeps,
): void {
  context.messaging.subscribe<GenerateCompletedPayload, { success: boolean }>(
    GENERATE_MESSAGES.REPORT_SUCCESS,
    async (msg) => handleGenerationCompleted(deps, msg.payload),
  );

  context.messaging.subscribe<GenerateFailedPayload, { success: boolean }>(
    GENERATE_MESSAGES.REPORT_FAILURE,
    async (msg) => handleGenerationFailed(deps, msg.payload),
  );

  deps.logger.debug("Subscribed to generation messages");
}

function subscribeToPublishAssetMessages(
  context: ServicePluginContext,
  deps: MessageHandlerDeps,
): void {
  context.messaging.subscribe<
    PublishAssetRegisterPayload,
    { success: boolean }
  >(PUBLISH_ASSET_MESSAGES.REGISTER, async (msg) =>
    handlePublishAssetRegister(deps, msg.payload),
  );

  deps.logger.debug("Subscribed to publish asset messages");
}

interface EntityChangePayload {
  entityType: string;
  entityId: string;
  entity?: BaseEntity;
}

function subscribeToEntityChangeMessages(
  context: ServicePluginContext,
  deps: MessageHandlerDeps,
): void {
  const handler = async (msg: {
    payload: EntityChangePayload;
  }): Promise<{ success: boolean }> =>
    handleEntityChange(context, deps, msg.payload);

  context.messaging.subscribe<EntityChangePayload, { success: boolean }>(
    "entity:created",
    handler,
  );
  context.messaging.subscribe<EntityChangePayload, { success: boolean }>(
    "entity:updated",
    handler,
  );

  deps.logger.debug("Subscribed to entity change messages for publish assets");
}

async function handleRegister(
  deps: MessageHandlerDeps,
  payload: PublishRegisterPayload,
): Promise<{ success: boolean }> {
  const { entityType, provider, config } = payload;

  try {
    const parsedConfig = config
      ? publishConfigSchema.safeParse(config)
      : undefined;
    if (parsedConfig && !parsedConfig.success) {
      deps.logger.warn("Invalid publish provider config", {
        entityType,
        error: parsedConfig.error.message,
      });
      return { success: false };
    }

    if (provider) {
      deps.providerRegistry.register(entityType, provider, parsedConfig?.data);
      deps.logger.info(`Registered provider for entity type: ${entityType}`, {
        providerName: provider.name,
        executionMode: deps.providerRegistry.getExecutionMode(entityType),
      });
    }
    return { success: true };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    deps.logger.error(`Failed to register provider: ${errorMessage}`);
    return { success: false };
  }
}

async function handlePublishAssetRegister(
  deps: MessageHandlerDeps,
  payload: PublishAssetRegisterPayload,
): Promise<{ success: boolean }> {
  const parsed = publishAssetDefinitionSchema.safeParse(payload);
  if (!parsed.success) {
    deps.logger.warn("Invalid publish asset registration", {
      error: parsed.error.message,
    });
    return { success: false };
  }

  deps.publishAssetRegistry.register(parsed.data);
  deps.logger.info("Registered publish asset", {
    entityType: parsed.data.entityType,
    attachmentType: parsed.data.attachmentType,
    mediaEntityType: parsed.data.mediaEntityType,
  });
  return { success: true };
}

async function handleEntityChange(
  context: ServicePluginContext,
  deps: MessageHandlerDeps,
  payload: EntityChangePayload,
): Promise<{ success: boolean }> {
  try {
    if (deps.publishAssetRegistry.list(payload.entityType).length === 0) {
      return { success: true };
    }

    const entity =
      payload.entity ??
      (await context.entityService.getEntity<BaseEntity>({
        entityType: payload.entityType,
        id: payload.entityId,
      }));
    if (!isPublishedEntity(entity)) {
      return { success: true };
    }

    await deps.publishAssetPreflight.ensureForEntity(entity);
    return { success: true };
  } catch (error) {
    deps.logger.warn("Failed to run publish asset preflight for entity event", {
      entityType: payload.entityType,
      entityId: payload.entityId,
      error: getErrorMessage(error),
    });
    return { success: false };
  }
}

function isPublishedEntity(
  entity: BaseEntity | null | undefined,
): entity is BaseEntity<PublishableMetadata & { status: "published" }> {
  if (!entity) return false;
  const parsed = publishableMetadataSchema.safeParse(entity.metadata);
  return parsed.success && parsed.data.status === "published";
}

async function handleQueue(
  context: ServicePluginContext,
  deps: MessageHandlerDeps,
  payload: PublishQueuePayload,
): Promise<{ success: boolean }> {
  const { entityType, entityId } = payload;

  try {
    const authContext = payload.authContext ?? SYSTEM_PUBLISH_AUTH_CONTEXT;
    context.permissions.assertEntityActionAllowed(
      entityType,
      "publish",
      authContext,
    );
    const result = await deps.queueManager.add(
      entityType,
      entityId,
      authContext,
    );

    await context.messaging.send({
      type: PUBLISH_MESSAGES.QUEUED,
      payload: {
        entityType,
        entityId,
        position: result.position,
      },
    });

    deps.logger.debug(`Entity queued: ${entityId}`, {
      entityType,
      position: result.position,
    });

    return { success: true };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
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
  const authContext = payload.authContext ?? SYSTEM_PUBLISH_AUTH_CONTEXT;

  try {
    context.permissions.assertEntityActionAllowed(
      entityType,
      "publish",
      authContext,
    );

    if (!deps.providerRegistry.has(entityType)) {
      deps.scheduler.failPublish(
        entityType,
        entityId,
        `No publish provider registered for ${entityType}`,
      );
      return { success: false };
    }

    const publishResult = await deps.publishExecutor.publish({
      entityType,
      id: entityId,
    });
    if ("error" in publishResult) {
      deps.scheduler.failPublish(entityType, entityId, publishResult.error);
      return { success: false };
    }

    deps.scheduler.completePublish(entityType, entityId, publishResult.result);
    deps.logger.debug(`Direct publish completed: ${entityId}`, {
      entityType,
    });
    return { success: true };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    deps.logger.error(`Failed direct publish request: ${errorMessage}`);
    return { success: false };
  }
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
    const errorMessage = getErrorMessage(error);
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
    const errorMessage = getErrorMessage(error);
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

    await context.messaging.send({
      type: PUBLISH_MESSAGES.LIST_RESPONSE,
      payload: {
        entityType,
        queue: queue.map((entry) => ({
          entityId: entry.entityId,
          position: entry.position,
          queuedAt: entry.queuedAt,
        })),
      },
    });

    return { success: true };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    deps.logger.error(`Failed to list queue: ${errorMessage}`);
    return { success: false };
  }
}

async function handleReportSuccess(
  deps: MessageHandlerDeps,
  payload: PublishReportSuccessPayload,
): Promise<{ success: boolean }> {
  const { entityType, entityId, result } = payload;

  deps.scheduler.completePublish(entityType, entityId, result);

  deps.logger.info(`Publish reported success: ${entityId}`, { entityType });

  return { success: true };
}

async function handleReportFailure(
  deps: MessageHandlerDeps,
  payload: PublishReportFailurePayload,
): Promise<{ success: boolean }> {
  const { entityType, entityId, error } = payload;

  deps.scheduler.failPublish(entityType, entityId, error);
  const retryInfo = deps.retryTracker.getRetryInfo(entityId);

  deps.logger.info(`Publish reported failure: ${entityId}`, {
    entityType,
    error,
    retryCount: retryInfo?.retryCount,
    willRetry: retryInfo?.willRetry,
  });

  return { success: true };
}

async function handleGenerationCompleted(
  deps: MessageHandlerDeps,
  payload: GenerateCompletedPayload,
): Promise<{ success: boolean }> {
  const { entityType, entityId } = payload;

  deps.scheduler.completeGeneration(entityType, entityId);
  deps.logger.info("Generation completed", { entityType, entityId });

  return { success: true };
}

async function handleGenerationFailed(
  deps: MessageHandlerDeps,
  payload: GenerateFailedPayload,
): Promise<{ success: boolean }> {
  const { entityType, error } = payload;

  deps.scheduler.failGeneration(entityType, error);
  deps.logger.warn("Generation failed", { entityType, error });

  return { success: true };
}
