import type { Logger } from "@brains/utils/logger";
import type { QueueManager } from "../queue-manager";
import type { ProviderRegistry } from "../provider-registry";
import type { RetryTracker } from "../retry-tracker";
import { ContentScheduler } from "../scheduler";
import type { PublishEntityExecutor } from "../publish-executor";
import { BunSchedulerBackend } from "@brains/scheduler";
import type { ContentPipelineConfig } from "../types/config";
import { checkGenerationConditions } from "./generation-conditions";
import type { SchedulerMessagePublisher } from "../types/scheduler";
import type { PipelineContext } from "./pipeline-context";

export interface CreateSchedulerDeps {
  context: PipelineContext;
  /** Broadcasts events and sends commands, as the package. */
  messaging: SchedulerMessagePublisher;
  config: ContentPipelineConfig;
  queueManager: QueueManager;
  providerRegistry: ProviderRegistry;
  retryTracker: RetryTracker;
  publishExecutor: PublishEntityExecutor;
  logger: Logger;
}

/**
 * Create and configure a ContentScheduler instance with message bus integration.
 */
export function createScheduler(deps: CreateSchedulerDeps): ContentScheduler {
  const {
    context,
    messaging,
    config,
    queueManager,
    providerRegistry,
    retryTracker,
    publishExecutor,
    logger,
  } = deps;

  return ContentScheduler.createFresh({
    queueManager,
    providerRegistry,
    retryTracker,
    logger,
    backend: new BunSchedulerBackend({
      onOverlapSkipped: (jobKey): void => {
        logger.debug("Skipping overlapping content scheduler cycle", {
          jobKey,
        });
      },
      onCallbackError: (jobKey, error): void => {
        logger.error("Unhandled content scheduler callback error", {
          jobKey,
          error,
        });
      },
    }),
    ...(config.entitySchedules && {
      entitySchedules: config.entitySchedules,
    }),
    ...(config.generationSchedules && {
      generationSchedules: config.generationSchedules,
    }),
    ...(config.generationConditions && {
      generationConditions: config.generationConditions,
    }),
    // The scheduler broadcasts events and sends commands, as the plugin.
    messageBus: messaging,
    publishExecutor,
    onCheckGenerationConditions: (entityType, conditions) =>
      checkGenerationConditions(
        context.entityService,
        logger,
        entityType,
        conditions,
      ),
  });
}
