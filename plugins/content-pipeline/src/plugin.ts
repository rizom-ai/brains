import type { Tool, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { QueueManager } from "./queue-manager";
import {
  createEnsureAssetsTool,
  createQueueTool,
  createPublishTool,
} from "./tools";
import { ProviderRegistry } from "./provider-registry";
import { RetryTracker } from "./retry-tracker";
import { PublishExecutor } from "./publish-executor";
import { PublishAssetRegistry } from "./publish-assets";
import { PublishAssetPreflight } from "./publish-asset-preflight";
import type { ContentScheduler } from "./scheduler";
import type { ContentPipelineConfig } from "./types/config";
import { contentPipelineConfigSchema } from "./types/config";
import { subscribeToMessages } from "./lib/message-handlers";
import { createScheduler } from "./lib/create-scheduler";
import { rebuildQueueFromEntities } from "./lib/queue-rebuild";
import { registerDashboardWidget } from "./lib/dashboard-widget";
import packageJson from "../package.json";

export class ContentPipelinePlugin extends ServicePlugin<ContentPipelineConfig> {
  private pluginContext?: ServicePluginContext;
  private queueManager!: QueueManager;
  private providerRegistry!: ProviderRegistry;
  private retryTracker!: RetryTracker;
  private publishExecutor!: PublishExecutor;
  private publishAssetRegistry!: PublishAssetRegistry;
  private publishAssetPreflight!: PublishAssetPreflight;
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
    this.retryTracker = RetryTracker.createFresh();
    this.publishAssetRegistry = PublishAssetRegistry.createFresh();
    this.publishAssetPreflight = new PublishAssetPreflight({
      context,
      registry: this.publishAssetRegistry,
    });
    this.publishExecutor = new PublishExecutor({
      context,
      providerRegistry: this.providerRegistry,
      publishAssetPreflight: this.publishAssetPreflight,
    });

    this.scheduler = createScheduler({
      context,
      config: this.config,
      queueManager: this.queueManager,
      providerRegistry: this.providerRegistry,
      retryTracker: this.retryTracker,
      publishExecutor: this.publishExecutor,
      logger: this.logger,
    });

    subscribeToMessages(context, {
      queueManager: this.queueManager,
      providerRegistry: this.providerRegistry,
      retryTracker: this.retryTracker,
      publishExecutor: this.publishExecutor,
      publishAssetRegistry: this.publishAssetRegistry,
      publishAssetPreflight: this.publishAssetPreflight,
      scheduler: this.scheduler,
      logger: this.logger,
    });
  }

  protected override async onReady(
    context: ServicePluginContext,
  ): Promise<void> {
    await rebuildQueueFromEntities(
      context.entityService,
      this.queueManager,
      this.logger,
    );
    await registerDashboardWidget(context, this.id);
    await this.scheduler.start();

    this.logger.info("Content pipeline plugin started");
  }

  protected override async getTools(): Promise<Tool[]> {
    if (!this.pluginContext) {
      throw new Error("Plugin context not initialized");
    }

    return [
      createQueueTool(this.pluginContext, this.id, this.queueManager),
      createPublishTool(
        this.pluginContext,
        this.id,
        this.providerRegistry,
        this.publishExecutor,
      ),
      createEnsureAssetsTool(
        this.pluginContext,
        this.id,
        this.publishAssetRegistry,
        this.publishAssetPreflight,
      ),
    ];
  }

  protected override async getInstructions(): Promise<string | undefined> {
    return `## Publishing
- Use \`content-pipeline_queue\` to manage the publish queue — list queued items, add entities to the queue, remove them, or reorder.
- Use \`content-pipeline_publish\` to publish an entity directly to its platform (e.g. LinkedIn, Buttondown). This tool has its own confirmation flow; call it without \`confirmed\` when the user asks to publish instead of asking for plain-text confirmation. Follow-up requests like "publish it now" should target the entity just read, generated, or updated in the conversation, including a post just changed to draft.
- Use \`content-pipeline_ensure-assets\` to reconcile missing publish assets such as generated OG images for already-published content.
- When users ask about their "publish queue", "publishing queue", or "what's queued", use \`content-pipeline_queue\`.`;
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

  public getPublishAssetRegistry(): PublishAssetRegistry {
    return this.publishAssetRegistry;
  }

  public getScheduler(): ContentScheduler {
    return this.scheduler;
  }

  protected override async onShutdown(): Promise<void> {
    await this.scheduler.stop();
    QueueManager.resetInstance();
    ProviderRegistry.resetInstance();
    RetryTracker.resetInstance();
    PublishAssetRegistry.resetInstance();
  }
}

export function contentPipelinePlugin(
  config?: Partial<ContentPipelineConfig>,
): ContentPipelinePlugin {
  return new ContentPipelinePlugin(config);
}
