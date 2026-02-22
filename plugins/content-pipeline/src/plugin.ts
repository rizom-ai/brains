import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { QueueManager } from "./queue-manager";
import { createQueueTool, createPublishTool } from "./tools";
import { ProviderRegistry } from "./provider-registry";
import { RetryTracker } from "./retry-tracker";
import type { ContentScheduler } from "./scheduler";
import type { ContentPipelineConfig } from "./types/config";
import { contentPipelineConfigSchema } from "./types/config";
import { subscribeToMessages } from "./lib/message-handlers";
import { createScheduler } from "./lib/create-scheduler";
import { rebuildQueueFromEntities } from "./lib/queue-rebuild";
import packageJson from "../package.json";

export class ContentPipelinePlugin extends ServicePlugin<ContentPipelineConfig> {
  private pluginContext?: ServicePluginContext;
  private queueManager!: QueueManager;
  private providerRegistry!: ProviderRegistry;
  private retryTracker!: RetryTracker;
  private scheduler!: ContentScheduler;

  constructor(config?: Partial<ContentPipelineConfig>) {
    super(
      "content-pipeline",
      packageJson,
      config ?? {},
      contentPipelineConfigSchema,
    );
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.pluginContext = context;

    this.queueManager = QueueManager.createFresh();
    this.providerRegistry = ProviderRegistry.createFresh();
    this.retryTracker = RetryTracker.createFresh({
      maxRetries: this.config.maxRetries,
      baseDelayMs: this.config.retryBaseDelayMs,
    });

    this.scheduler = createScheduler({
      context,
      config: this.config,
      queueManager: this.queueManager,
      providerRegistry: this.providerRegistry,
      retryTracker: this.retryTracker,
      logger: this.logger,
    });

    subscribeToMessages(context, {
      queueManager: this.queueManager,
      providerRegistry: this.providerRegistry,
      retryTracker: this.retryTracker,
      scheduler: this.scheduler,
      logger: this.logger,
    });

    context.messaging.subscribe("sync:initial:completed", async () => {
      await rebuildQueueFromEntities(
        context.entityService,
        this.queueManager,
        this.logger,
      );
      return { success: true };
    });

    await this.scheduler.start();

    this.logger.info("Content pipeline plugin started");
  }

  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.pluginContext) {
      throw new Error("Plugin context not initialized");
    }

    return [
      createQueueTool(this.pluginContext, this.id, this.queueManager),
      createPublishTool(this.pluginContext, this.id, this.providerRegistry),
    ];
  }

  public async cleanup(): Promise<void> {
    await this.scheduler.stop();
    this.logger.info("Content pipeline plugin stopped");
  }

  public getQueueManager(): QueueManager {
    return this.queueManager;
  }

  public getProviderRegistry(): ProviderRegistry {
    return this.providerRegistry;
  }

  public getRetryTracker(): RetryTracker {
    return this.retryTracker;
  }

  public getScheduler(): ContentScheduler {
    return this.scheduler;
  }
}

export function contentPipelinePlugin(
  config?: Partial<ContentPipelineConfig>,
): ContentPipelinePlugin {
  return new ContentPipelinePlugin(config);
}
