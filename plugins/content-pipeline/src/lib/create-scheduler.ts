import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { QueueManager } from "../queue-manager";
import type { ProviderRegistry } from "../provider-registry";
import type { RetryTracker } from "../retry-tracker";
import { ContentScheduler } from "../scheduler";
import { CronerBackend } from "../scheduler-backend";
import { GENERATE_MESSAGES, PUBLISH_MESSAGES } from "../types/messages";
import type { ContentPipelineConfig } from "../types/config";
import { checkGenerationConditions } from "./generation-conditions";

export interface CreateSchedulerDeps {
  context: ServicePluginContext;
  config: ContentPipelineConfig;
  queueManager: QueueManager;
  providerRegistry: ProviderRegistry;
  retryTracker: RetryTracker;
  logger: Logger;
}

/**
 * Create and configure a ContentScheduler instance with message bus integration.
 */
export function createScheduler(deps: CreateSchedulerDeps): ContentScheduler {
  const {
    context,
    config,
    queueManager,
    providerRegistry,
    retryTracker,
    logger,
  } = deps;

  const messageBusAdapter = {
    send: async (channel: string, message: unknown): Promise<unknown> => {
      return context.messaging.send(channel, message);
    },
    subscribe: (): (() => void) => () => {},
  };

  return ContentScheduler.createFresh({
    queueManager,
    providerRegistry,
    retryTracker,
    logger,
    backend: new CronerBackend(),
    ...(config.entitySchedules && {
      entitySchedules: config.entitySchedules,
    }),
    ...(config.generationSchedules && {
      generationSchedules: config.generationSchedules,
    }),
    ...(config.generationConditions && {
      generationConditions: config.generationConditions,
    }),
    messageBus: messageBusAdapter as never,
    entityService: context.entityService,
    onPublish: (event) => {
      void context.messaging.send(PUBLISH_MESSAGES.COMPLETED, {
        entityType: event.entityType,
        entityId: event.entityId,
        result: event.result,
      });
    },
    onFailed: (event) => {
      void context.messaging.send(PUBLISH_MESSAGES.FAILED, {
        entityType: event.entityType,
        entityId: event.entityId,
        error: event.error,
        retryCount: event.retryCount,
        willRetry: event.willRetry,
      });
    },
    onCheckGenerationConditions: (entityType, conditions) =>
      checkGenerationConditions(
        context.entityService,
        logger,
        entityType,
        conditions,
      ),
    onGenerate: (event) => {
      logger.info(`Generation triggered for ${event.entityType}`);
      void context.messaging.send(GENERATE_MESSAGES.EXECUTE, {
        entityType: event.entityType,
      });
    },
  });
}
