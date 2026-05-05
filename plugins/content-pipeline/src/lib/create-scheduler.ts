import type { IMessageBus, ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { QueueManager } from "../queue-manager";
import type { ProviderRegistry } from "../provider-registry";
import type { RetryTracker } from "../retry-tracker";
import { ContentScheduler } from "../scheduler";
import { CronerBackend } from "../scheduler-backend";
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

  const messageBus = createMessageBusAdapter(context);

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
    messageBus,
    entityService: context.entityService,
    onCheckGenerationConditions: (entityType, conditions) =>
      checkGenerationConditions(
        context.entityService,
        logger,
        entityType,
        conditions,
      ),
  });
}

function createMessageBusAdapter(context: ServicePluginContext): IMessageBus {
  const send: IMessageBus["send"] = async (request) => {
    return context.messaging.send({
      type: request.type,
      payload: request.payload,
      ...(request.target !== undefined ? { target: request.target } : {}),
      ...(request.metadata !== undefined ? { metadata: request.metadata } : {}),
      ...(request.broadcast !== undefined
        ? { broadcast: request.broadcast }
        : {}),
    });
  };

  const subscribe: IMessageBus["subscribe"] = () => () => {};
  const unsubscribe: IMessageBus["unsubscribe"] = () => {};

  return { send, subscribe, unsubscribe };
}
