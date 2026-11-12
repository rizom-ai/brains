import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import {
  createContentPipelinePackage,
  type ContentPipelineServices,
} from "../src/plugin";
import type { ContentPipelineConfigInput } from "../src/types/config";
import type { QueueManager } from "../src/queue-manager";
import type { ProviderRegistry } from "../src/provider-registry";
import type { RetryTracker } from "../src/retry-tracker";
import type { PublicationQueueService } from "../src/publication-queue-service";
import type { PublishAssetRegistry } from "../src/publish-assets";
import type { ContentScheduler } from "../src/scheduler";

/** The content-pipeline package's plugins, as a brain installs them. */
export function createContentPipelinePlugins(
  config: ContentPipelineConfigInput = {},
): Plugin[] {
  return [createContentPipelinePlugin(config)];
}

/**
 * The content-pipeline package's plugin, as the canonical brain installs it
 * under its class's plugin id, with the services a test reads once it has
 * registered.
 */
export type ContentPipelineTestPlugin = Plugin & {
  ready(): Promise<void>;
  shutdown(): Promise<void>;
  getQueueManager(): QueueManager;
  getPublicationQueueService(): PublicationQueueService;
  getProviderRegistry(): ProviderRegistry;
  getRetryTracker(): RetryTracker;
  getPublishAssetRegistry(): PublishAssetRegistry;
  getScheduler(): ContentScheduler;
};

export function createContentPipelinePlugin(
  config: ContentPipelineConfigInput = {},
): ContentPipelineTestPlugin {
  let services: ContentPipelineServices | undefined;
  const registered = (): ContentPipelineServices => {
    if (!services) {
      throw new Error(
        "Content pipeline runtime is unavailable before plugin registration",
      );
    }
    return services;
  };
  const [plugin] = instantiatePluginPackageDefinition(
    createContentPipelinePackage({
      onSetup: (built) => {
        services = built;
      },
    }),
    config,
    { name: "@brains/content-pipeline", version: "0.0.0-test" },
    { pluginId: "content-pipeline" },
  );
  if (!plugin)
    throw new Error("The content-pipeline package created no plugin");
  const ready = plugin.ready?.bind(plugin);
  const shutdown = plugin.shutdown?.bind(plugin);
  return Object.assign(plugin, {
    ready: async (): Promise<void> => {
      await ready?.();
    },
    shutdown: async (): Promise<void> => {
      await shutdown?.();
    },
    getQueueManager: (): QueueManager => registered().queueManager,
    getPublicationQueueService: (): PublicationQueueService =>
      registered().publicationQueueService,
    getProviderRegistry: (): ProviderRegistry => registered().providerRegistry,
    getRetryTracker: (): RetryTracker => registered().retryTracker,
    getPublishAssetRegistry: (): PublishAssetRegistry =>
      registered().publishAssetRegistry,
    getScheduler: (): ContentScheduler => registered().scheduler,
  });
}
