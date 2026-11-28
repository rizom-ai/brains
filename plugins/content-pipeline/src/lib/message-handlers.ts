import {
  generateReportFailureContract,
  generateReportSuccessContract,
  publishAssetRegisterContract,
  publishCompletedChannel,
  publishFailedChannel,
  publishRegisterContract,
  publishRequestContract,
  SdkError,
  type PublishRequest,
  type PublishRequestResponse,
  type GenerateReportFailurePayload,
  type GenerateReportSuccessPayload,
  type PublishAssetDefinition,
} from "@brains/contracts";
import type { z } from "@brains/utils/zod";
import { getErrorMessage } from "@brains/utils/error";
import { truncateText } from "@brains/utils/string-utils";
import {
  entityCreatedChannel,
  entityUpdatedChannel,
  type EntityChangePayload,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import type { Logger } from "@brains/utils/logger";
import type { PublicationQueueService } from "../publication-queue-service";
import type { PublishEntityExecutor } from "../publish-executor";
import {
  publishableMetadataSchema,
  type PublishableMetadata,
} from "../schemas/publishable";
import type { ProviderRegistry } from "../provider-registry";
import type { PublishAssetRegistry } from "../publish-assets";
import type { PublishAssetPreflight } from "../publish-asset-preflight";
import type { PipelineContext } from "./pipeline-context";

/** How the package answers and hears the bus, as its class did. */
export type PipelineBus = Pick<ServiceRuntime, "answer" | "listen">;

export interface MessageHandlerDeps {
  publishExecutor: PublishEntityExecutor;
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
  bus: PipelineBus,
  context: PipelineContext,
  deps: MessageHandlerDeps,
): void {
  subscribeToPublishMessages(bus, context, deps);
  subscribeToGenerationMessages(bus, deps);
  subscribeToPublishAssetMessages(bus, deps);
  subscribeToEntityChangeMessages(bus, context, deps);
}

/**
 * Publish an entry now for a person who chose to, somewhere that asked them
 * itself. What may be published and by whom is decided here, as for the
 * publish action; why not, when not, is the person's to read.
 */
async function handlePublishRequest(
  context: PipelineContext,
  deps: MessageHandlerDeps,
  request: PublishRequest,
): Promise<PublishRequestResponse> {
  const refused = (reason: string, cause?: unknown): SdkError =>
    new SdkError("conflict", {
      publicMessage: truncateText(reason, 300),
      cause,
    });
  try {
    context.permissions.assertEntityActionAllowed(
      request.entityType,
      "publish",
      { userPermissionLevel: request.permissionLevel },
    );
  } catch (error) {
    throw new SdkError("permission_denied", {
      publicMessage: truncateText(
        getErrorMessage(error, "You may not publish this"),
        300,
      ),
      cause: error,
    });
  }
  const outcome = await deps.publishExecutor
    .publish({ entityType: request.entityType, id: request.id })
    .catch((error: unknown) => {
      throw refused(getErrorMessage(error, "It could not be published"), error);
    });
  if ("error" in outcome) throw refused(outcome.error);
  const { url } = outcome.result;
  return { published: true, ...(url !== undefined && { url }) };
}

function subscribeToPublishMessages(
  bus: PipelineBus,
  context: PipelineContext,
  deps: MessageHandlerDeps,
): void {
  bus.answer(publishRegisterContract, async ({ request }) =>
    handleRegister(deps, request),
  );
  bus.answer(publishRequestContract, async ({ request }) =>
    handlePublishRequest(context, deps, request),
  );

  bus.listen(
    publishCompletedChannel,
    async ({ payload }) => {
      await deps.publicationQueueService.complete(
        payload.entityType,
        payload.entityId,
      );
    },
    { mode: "subscribe" },
  );

  bus.listen(
    publishFailedChannel,
    async ({ payload }) => {
      await deps.publicationQueueService.fail(
        payload.entityType,
        payload.entityId,
        payload.error,
      );
    },
    { mode: "subscribe" },
  );

  deps.logger.debug("Subscribed to publish messages");
}

function subscribeToGenerationMessages(
  bus: PipelineBus,
  deps: MessageHandlerDeps,
): void {
  bus.answer(
    generateReportSuccessContract,
    async ({ request }) => handleGenerationCompleted(deps, request),
    { everyProcess: true },
  );

  bus.answer(
    generateReportFailureContract,
    async ({ request }) => handleGenerationFailed(deps, request),
    { everyProcess: true },
  );

  deps.logger.debug("Subscribed to generation messages");
}

function subscribeToPublishAssetMessages(
  bus: PipelineBus,
  deps: MessageHandlerDeps,
): void {
  bus.answer(publishAssetRegisterContract, async ({ request }) =>
    handlePublishAssetRegister(deps, request),
  );

  deps.logger.debug("Subscribed to publish asset messages");
}

function subscribeToEntityChangeMessages(
  bus: PipelineBus,
  context: PipelineContext,
  deps: MessageHandlerDeps,
): void {
  const handler = async ({
    payload,
  }: {
    readonly payload: EntityChangePayload;
  }): Promise<void> => {
    await handleEntityChange(context, deps, payload);
  };

  // Observed: an entity the worker publishes needs its assets too.
  bus.listen(entityCreatedChannel, handler, { mode: "observe" });
  bus.listen(entityUpdatedChannel, handler, { mode: "observe" });

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
  context: PipelineContext,
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
