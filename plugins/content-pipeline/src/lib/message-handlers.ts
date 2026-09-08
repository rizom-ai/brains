import { ENTITY_CHANNELS, type PublishProvider } from "@brains/contracts";
import { getErrorMessage } from "@brains/utils/error";
import type { BaseEntity } from "@brains/sdk/entities";
import {
  defineSubscription,
  type AnySubscriptionDefinition,
  type LoggerContract,
} from "@brains/sdk/services";
import { z } from "@brains/utils/zod";
import type { PipelineRuntime } from "../runtime";
import type { QueueManager } from "../queue-manager";
import type { PublicationQueueService } from "../publication-queue-service";
import type { RetryTracker } from "../retry-tracker";
import type { ContentScheduler } from "../scheduler";
import {
  publishableEntitySchema,
  publishableMetadataSchema,
  type PublishableMetadata,
} from "../schemas/publishable";
import {
  PUBLISH_MESSAGES,
  GENERATE_MESSAGES,
  PUBLISH_ASSET_MESSAGES,
  SYSTEM_PUBLISH_AUTH_CONTEXT,
} from "../types/messages";
import type { ProviderRegistry } from "../provider-registry";
import type { PublishEntityExecutor } from "../publish-executor";
import type { PublishAssetRegistry } from "../publish-assets";
import { publishAssetDefinitionSchema } from "../publish-assets";
import type { PublishAssetPreflight } from "../publish-asset-preflight";
import { publishConfigSchema } from "../types/config";

export interface MessageHandlerDeps {
  queueManager: QueueManager;
  publicationQueueService: PublicationQueueService;
  providerRegistry: ProviderRegistry;
  retryTracker: RetryTracker;
  publishExecutor: PublishEntityExecutor;
  publishAssetRegistry: PublishAssetRegistry;
  publishAssetPreflight: PublishAssetPreflight;
  scheduler: ContentScheduler;
  logger: LoggerContract;
}

const entityRef = {
  entityType: z.string().min(1),
  entityId: z.string().min(1),
};

/** A provider is a function pair, which only a runtime check can confirm. */
const providerSchema = z.custom<PublishProvider>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "publish") === "function",
  { message: "Expected a publish provider" },
);

const registerPayload = z.looseObject({
  entityType: z.string().min(1),
  provider: providerSchema.optional(),
  config: z.unknown().optional(),
});
const authContextPayload = z.looseObject({
  interfaceType: z.string().optional(),
  userPermissionLevel: z.enum(["public", "trusted", "admin"]).optional(),
  authorization: z.enum(["user", "system"]).optional(),
});
const entityRefPayload = z.looseObject({
  ...entityRef,
  authContext: authContextPayload.optional(),
});
const reorderPayload = z.looseObject({
  ...entityRef,
  position: z.number().int(),
});
const listPayload = z.looseObject({ entityType: z.string().min(1) });
const reportSuccessPayload = z.looseObject({
  ...entityRef,
  result: z.looseObject({ id: z.string(), url: z.string().optional() }),
});
const reportFailurePayload = z.looseObject({
  ...entityRef,
  error: z.string(),
});
const generationCompletedPayload = z.looseObject({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
});
const generationFailedPayload = z.looseObject({
  entityType: z.string().min(1),
  error: z.string(),
});
const entityChangePayload = z.looseObject({
  ...entityRef,
  entity: z.unknown().optional(),
});
const assetRegisterPayload = z.looseObject({
  entityType: z.string().min(1),
  attachmentType: z.string().min(1),
});

type RegisterPayload = z.output<typeof registerPayload>;
type EntityRefPayload = z.output<typeof entityRefPayload>;
type ReorderPayload = z.output<typeof reorderPayload>;
type ListPayload = z.output<typeof listPayload>;
type ReportSuccessPayload = z.output<typeof reportSuccessPayload>;
type ReportFailurePayload = z.output<typeof reportFailurePayload>;
type GenerationCompletedPayload = z.output<typeof generationCompletedPayload>;
type GenerationFailedPayload = z.output<typeof generationFailedPayload>;
type EntityChangePayload = z.output<typeof entityChangePayload>;
type AssetRegisterPayload = z.output<typeof assetRegisterPayload>;

/**
 * Everything the pipeline answers on the bus.
 *
 * Registering a provider, queueing an entity, reporting an outcome and the
 * entity changes that trigger asset preflight are all requests arriving on a
 * topic — the shape the subscription slot exists for.
 */
export function pipelineSubscriptions(
  context: PipelineRuntime,
  deps: MessageHandlerDeps,
): AnySubscriptionDefinition[] {
  return [
    defineSubscription({
      topic: PUBLISH_MESSAGES.REGISTER,
      payload: registerPayload,
      handle: ({ payload }) => handleRegister(deps, payload),
    }),
    defineSubscription({
      topic: PUBLISH_MESSAGES.QUEUE,
      payload: entityRefPayload,
      handle: ({ payload }) => handleQueue(context, deps, payload),
    }),
    defineSubscription({
      topic: PUBLISH_MESSAGES.DIRECT,
      payload: entityRefPayload,
      handle: ({ payload }) => handleDirect(context, deps, payload),
    }),
    defineSubscription({
      topic: PUBLISH_MESSAGES.REMOVE,
      payload: entityRefPayload,
      handle: ({ payload }) => handleRemove(deps, payload),
    }),
    defineSubscription({
      topic: PUBLISH_MESSAGES.REORDER,
      payload: reorderPayload,
      handle: ({ payload }) => handleReorder(deps, payload),
    }),
    defineSubscription({
      topic: PUBLISH_MESSAGES.LIST,
      payload: listPayload,
      handle: ({ payload }) => handleList(context, deps, payload),
    }),
    defineSubscription({
      topic: PUBLISH_MESSAGES.REPORT_SUCCESS,
      payload: reportSuccessPayload,
      handle: ({ payload }) => handleReportSuccess(deps, payload),
    }),
    defineSubscription({
      topic: PUBLISH_MESSAGES.REPORT_FAILURE,
      payload: reportFailurePayload,
      handle: ({ payload }) => handleReportFailure(deps, payload),
    }),
    defineSubscription({
      topic: PUBLISH_MESSAGES.COMPLETED,
      payload: entityRefPayload,
      handle: async ({ payload }) => {
        await deps.publicationQueueService.complete(
          payload.entityType,
          payload.entityId,
        );
        return { success: true };
      },
    }),
    defineSubscription({
      topic: PUBLISH_MESSAGES.FAILED,
      payload: reportFailurePayload,
      handle: async ({ payload }) => {
        await deps.publicationQueueService.fail(
          payload.entityType,
          payload.entityId,
          payload.error,
        );
        return { success: true };
      },
    }),
    defineSubscription({
      topic: PUBLISH_ASSET_MESSAGES.REGISTER,
      payload: assetRegisterPayload,
      handle: ({ payload }) => handlePublishAssetRegister(deps, payload),
    }),
    // Generation reports arrive from the durable job that ran the work.
    defineSubscription({
      topic: GENERATE_MESSAGES.REPORT_SUCCESS,
      payload: generationCompletedPayload,
      handle: ({ payload }) => handleGenerationCompleted(deps, payload),
    }),
    defineSubscription({
      topic: GENERATE_MESSAGES.REPORT_FAILURE,
      payload: generationFailedPayload,
      handle: ({ payload }) => handleGenerationFailed(deps, payload),
    }),
    defineSubscription({
      topic: ENTITY_CHANNELS.created,
      payload: entityChangePayload,
      handle: ({ payload }) => handleEntityChange(context, deps, payload),
    }),
    defineSubscription({
      topic: ENTITY_CHANNELS.updated,
      payload: entityChangePayload,
      handle: ({ payload }) => handleEntityChange(context, deps, payload),
    }),
  ];
}

async function handleRegister(
  deps: MessageHandlerDeps,
  payload: RegisterPayload,
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
  payload: AssetRegisterPayload,
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
  context: PipelineRuntime,
  deps: MessageHandlerDeps,
  payload: EntityChangePayload,
): Promise<{ success: boolean }> {
  try {
    if (deps.publishAssetRegistry.list(payload.entityType).length === 0) {
      return { success: true };
    }

    // The event carries the entity that changed; it is read back only when
    // the sender included none, or included something unreadable.
    const carried = publishableEntitySchema.safeParse(payload.entity);
    const entity = carried.success
      ? carried.data
      : await context.entities.getEntity({
          entityType: payload.entityType,
          id: payload.entityId,
        });
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
  context: PipelineRuntime,
  deps: MessageHandlerDeps,
  payload: EntityRefPayload,
): Promise<{ success: boolean }> {
  const { entityType, entityId } = payload;

  try {
    const authContext = payload.authContext ?? SYSTEM_PUBLISH_AUTH_CONTEXT;
    context.permissions.assertEntityActionAllowed(
      entityType,
      "publish",
      authContext,
    );
    const result = await deps.publicationQueueService.enqueue(
      entityType,
      entityId,
      authContext,
    );

    await context.messaging.request({
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
  context: PipelineRuntime,
  deps: MessageHandlerDeps,
  payload: EntityRefPayload,
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
  payload: EntityRefPayload,
): Promise<{ success: boolean }> {
  const { entityType, entityId } = payload;

  try {
    await deps.publicationQueueService.remove(entityType, entityId);
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
  payload: ReorderPayload,
): Promise<{ success: boolean }> {
  const { entityType, entityId, position } = payload;

  try {
    await deps.publicationQueueService.reorder(entityType, entityId, position);
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
  context: PipelineRuntime,
  deps: MessageHandlerDeps,
  payload: ListPayload,
): Promise<{ success: boolean }> {
  const { entityType } = payload;

  try {
    const queue = await deps.queueManager.list(entityType);

    await context.messaging.request({
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
  payload: ReportSuccessPayload,
): Promise<{ success: boolean }> {
  const { entityType, entityId, result } = payload;

  deps.scheduler.completePublish(entityType, entityId, {
    id: result.id,
    ...(result.url === undefined ? {} : { url: result.url }),
  });

  deps.logger.info(`Publish reported success: ${entityId}`, { entityType });

  return { success: true };
}

async function handleReportFailure(
  deps: MessageHandlerDeps,
  payload: ReportFailurePayload,
): Promise<{ success: boolean }> {
  const { entityType, entityId, error } = payload;

  deps.scheduler.failPublish(entityType, entityId, error);
  const retryInfo = deps.retryTracker.getRetryInfo(entityId);

  deps.logger.info(`Publish reported failure: ${entityId}`, {
    entityType,
    error,
    retryCount: retryInfo?.retryCount,
  });

  return { success: true };
}

async function handleGenerationCompleted(
  deps: MessageHandlerDeps,
  payload: GenerationCompletedPayload,
): Promise<{ success: boolean }> {
  const { entityType, entityId } = payload;

  deps.scheduler.completeGeneration(entityType, entityId);
  deps.logger.info("Generation completed", { entityType, entityId });

  return { success: true };
}

async function handleGenerationFailed(
  deps: MessageHandlerDeps,
  payload: GenerationFailedPayload,
): Promise<{ success: boolean }> {
  const { entityType, error } = payload;

  deps.scheduler.failGeneration(entityType, error);
  deps.logger.warn("Generation failed", { entityType, error });

  return { success: true };
}
