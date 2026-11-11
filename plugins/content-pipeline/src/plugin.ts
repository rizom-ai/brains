import { defineServicePlugin } from "@brains/sdk/services";
import type { ServicePackageDefinition } from "@brains/sdk/services";
import {
  serviceRuntime,
  withTools,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import { QueueManager } from "./queue-manager";
import { createPublishingManageTool } from "./tools";
import { ProviderRegistry } from "./provider-registry";
import { RetryTracker } from "./retry-tracker";
import { PublicationQueueService } from "./publication-queue-service";
import { PublishExecutor } from "./publish-executor";
import { PublishAssetRegistry } from "./publish-assets";
import { PublishAssetPreflight } from "./publish-asset-preflight";
import type { ContentScheduler } from "./scheduler";
import {
  contentPipelineConfigSchema,
  type ContentPipelineConfig,
} from "./types/config";
import { subscribeToMessages } from "./lib/message-handlers";
import { createScheduler } from "./lib/create-scheduler";
import { registerDashboardWidget } from "./lib/dashboard-widget";
import { registerStudioWorkspace } from "./lib/studio-workspace";
import type { PipelineContext } from "./lib/pipeline-context";

/** The services the package builds when it sets up, as one unit. */
export interface ContentPipelineServices {
  readonly context: PipelineContext;
  readonly queueManager: QueueManager;
  readonly publicationQueueService: PublicationQueueService;
  readonly providerRegistry: ProviderRegistry;
  readonly retryTracker: RetryTracker;
  readonly publishExecutor: PublishExecutor;
  readonly publishAssetRegistry: PublishAssetRegistry;
  readonly publishAssetPreflight: PublishAssetPreflight;
  readonly scheduler: ContentScheduler;
}

export interface ContentPipelineDeps {
  /** Told the services once setup has built them. */
  onSetup?: ((services: ContentPipelineServices) => void) | undefined;
}

/** What the pipeline reads, writes, checks and queues through, from the runtime. */
function pipelineContextOf(runtime: ServiceRuntime): PipelineContext {
  return {
    logger: runtime.logger,
    entityService: {
      getEntity: runtime.entityReads.getEntity,
      getEntityRaw: runtime.entityReads.getEntityRaw,
      listEntities: runtime.entityReads.listEntities,
      updateEntity: runtime.entityWrites.updateEntity,
    },
    permissions: runtime.permissions,
    attachments: runtime.attachments,
    jobs: runtime.jobs,
    runtimeState: runtime.classRuntimeState,
  };
}

/**
 * Build the pipeline as the class built it when it registered: its queue,
 * providers, retries, publish executor, asset preflight and scheduler; the
 * bus it answers and hears; and, once the brain is ready, its queue
 * reconciled, its Publishing workspace shown and its scheduler started.
 */
function setUpContentPipeline(
  runtime: ServiceRuntime,
  config: ContentPipelineConfig,
  onCleanup: (cleanup: () => void | Promise<void>) => void,
): ContentPipelineServices {
  const context = pipelineContextOf(runtime);
  const logger = runtime.logger;
  const queueManager = QueueManager.createFresh();
  const publicationQueueService = new PublicationQueueService(
    context,
    queueManager,
  );
  const providerRegistry = ProviderRegistry.createFresh();
  const retryTracker = RetryTracker.createFresh();
  const publishAssetRegistry = PublishAssetRegistry.createFresh();
  const publishAssetPreflight = new PublishAssetPreflight({
    context,
    registry: publishAssetRegistry,
    retries: runtime.retries,
  });
  const publishExecutor = new PublishExecutor({
    context,
    providerRegistry,
    publishAssetPreflight,
  });
  const scheduler = createScheduler({
    context,
    // The scheduler broadcasts events and sends commands, as the package.
    messaging: runtime.messaging,
    config,
    queueManager,
    providerRegistry,
    retryTracker,
    publishExecutor,
    logger,
  });
  const services: ContentPipelineServices = {
    context,
    queueManager,
    publicationQueueService,
    providerRegistry,
    retryTracker,
    publishExecutor,
    publishAssetRegistry,
    publishAssetPreflight,
    scheduler,
  };

  subscribeToMessages(runtime, context, {
    publicationQueueService,
    providerRegistry,
    publishAssetRegistry,
    publishAssetPreflight,
    logger,
  });
  registerDashboardWidget(runtime, context, {
    providerRegistry,
    queueManager,
    retryTracker,
  });

  let studioRegistered = false;
  runtime.ready(async () => {
    await publicationQueueService.reconcile(
      providerRegistry.getRegisteredTypes(),
    );
    const workspaceUrl = await registerStudioWorkspace(
      runtime.studio,
      context,
      {
        providerRegistry,
        queueManager,
        publicationQueueService,
        retryTracker,
        publishExecutor,
      },
    );
    studioRegistered = workspaceUrl !== undefined;
    await scheduler.start();
    logger.info("Content pipeline plugin started");
  });
  onCleanup(async () => {
    if (studioRegistered) {
      await runtime.studio.unregister("content-pipeline:publishing");
      studioRegistered = false;
    }
    await scheduler.stop();
  });
  return services;
}

/**
 * The publishing pipeline: one queue per publishable type, the providers
 * entity packages register, scheduled publishing and generation, publish
 * assets prepared before a record publishes, the publishing_manage tool,
 * the Studio Publishing workspace and the Dashboard pipeline widget.
 */
export function createContentPipelinePackage(
  deps: ContentPipelineDeps = {},
): ServicePackageDefinition<typeof contentPipelineConfigSchema> {
  const service = defineServicePlugin({
    id: "content-pipeline",
    config: contentPipelineConfigSchema,
    setup: (context): ContentPipelineServices => {
      const services = setUpContentPipeline(
        serviceRuntime(context),
        context.config,
        context.lifecycle.onCleanup,
      );
      deps.onSetup?.(services);
      return services;
    },
  });
  return withTools<typeof contentPipelineConfigSchema, ContentPipelineServices>(
    service,
    ({ state }) => [
      createPublishingManageTool(state.context, {
        queueManager: state.queueManager,
        publicationQueueService: state.publicationQueueService,
        providerRegistry: state.providerRegistry,
        publishExecutor: state.publishExecutor,
      }),
    ],
  );
}
