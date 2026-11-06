import {
  ENTITY_CHANNELS,
  PUBLISH_CHANNELS,
  generateReportFailureContract,
  generateReportSuccessContract,
  publishAssetRegisterContract,
  publishRegisterContract,
  type GenerateReportFailurePayload,
  type GenerateReportSuccessPayload,
  type PublishAssetDefinition,
} from "@brains/contracts";
import type { z } from "@brains/utils/zod";
import { getErrorMessage } from "@brains/utils/error";
import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { PublicationQueueService } from "../publication-queue-service";
import {
  publishableMetadataSchema,
  type PublishableMetadata,
} from "../schemas/publishable";
import type {
  PublishCompletedPayload,
  PublishFailedPayload,
} from "../types/messages";
import type { ProviderRegistry } from "../provider-registry";
import type { PublishAssetRegistry } from "../publish-assets";
import type { PublishAssetPreflight } from "../publish-asset-preflight";

export interface MessageHandlerDeps {
  publicationQueueService: PublicationQueueService;
  providerRegistry: ProviderRegistry;
  publishAssetRegistry: PublishAssetRegistry;
  publishAssetPreflight: PublishAssetPreflight;
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
  context.messaging.answer(publishRegisterContract, async (registration) =>
    handleRegister(deps, registration),
  );

  context.messaging.subscribe<PublishCompletedPayload, { success: boolean }>(
    PUBLISH_CHANNELS.completed,
    async (msg) => {
      await deps.publicationQueueService.complete(
        msg.payload.entityType,
        msg.payload.entityId,
      );
      return { success: true };
    },
  );

  context.messaging.subscribe<PublishFailedPayload, { success: boolean }>(
    PUBLISH_CHANNELS.failed,
    async (msg) => {
      await deps.publicationQueueService.fail(
        msg.payload.entityType,
        msg.payload.entityId,
        msg.payload.error,
      );
      return { success: true };
    },
  );

  deps.logger.debug("Subscribed to publish messages");
}

function subscribeToGenerationMessages(
  context: ServicePluginContext,
  deps: MessageHandlerDeps,
): void {
  context.messaging.answer(
    generateReportSuccessContract,
    async (report) => handleGenerationCompleted(deps, report),
    { everyProcess: true },
  );

  context.messaging.answer(
    generateReportFailureContract,
    async (report) => handleGenerationFailed(deps, report),
    { everyProcess: true },
  );

  deps.logger.debug("Subscribed to generation messages");
}

function subscribeToPublishAssetMessages(
  context: ServicePluginContext,
  deps: MessageHandlerDeps,
): void {
  context.messaging.answer(publishAssetRegisterContract, async (definition) =>
    handlePublishAssetRegister(deps, definition),
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

  // Observed: an entity the worker publishes needs its assets too.
  context.messaging.observe<EntityChangePayload, { success: boolean }>(
    ENTITY_CHANNELS.created,
    handler,
  );
  context.messaging.observe<EntityChangePayload, { success: boolean }>(
    ENTITY_CHANNELS.updated,
    handler,
  );

  deps.logger.debug("Subscribed to entity change messages for publish assets");
}

async function handleRegister(
  deps: MessageHandlerDeps,
  registration: z.output<typeof publishRegisterContract.schema>,
): Promise<void> {
  const { entityType, provider, config } = registration;
  if (!provider) return;
  try {
    deps.providerRegistry.register(entityType, provider, config);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    deps.logger.error(`Failed to register provider: ${errorMessage}`);
    throw error;
  }
  deps.logger.info(`Registered provider for entity type: ${entityType}`, {
    providerName: provider.name,
    executionMode: deps.providerRegistry.getExecutionMode(entityType),
  });
}

async function handlePublishAssetRegister(
  deps: MessageHandlerDeps,
  definition: PublishAssetDefinition,
): Promise<void> {
  deps.publishAssetRegistry.register(definition);
  deps.logger.info("Registered publish asset", {
    entityType: definition.entityType,
    attachmentType: definition.attachmentType,
    mediaEntityType: definition.mediaEntityType,
  });
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
      (await context.entityService.getEntity({
        entityType: payload.entityType,
        id: payload.entityId,
      }));
    if (!isPublishedEntity(entity)) {
      return { success: true };
    }

    await deps.publishAssetPreflight.ensureOrRetry(entity);
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

async function handleGenerationCompleted(
  deps: MessageHandlerDeps,
  report: GenerateReportSuccessPayload,
): Promise<void> {
  const { entityType, entityId } = report;
  deps.logger.info("Generation completed", { entityType, entityId });
}

async function handleGenerationFailed(
  deps: MessageHandlerDeps,
  report: GenerateReportFailurePayload,
): Promise<void> {
  const { entityType, error } = report;
  deps.logger.warn("Generation failed", { entityType, error });
}
