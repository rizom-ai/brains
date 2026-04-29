import type { Tool, ServicePluginContext } from "@brains/plugins";
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
  }

  protected override async onReady(
    context: ServicePluginContext,
  ): Promise<void> {
    await rebuildQueueFromEntities(
      context.entityService,
      this.queueManager,
      this.logger,
    );
    await this.registerDashboardWidget(context);
    await this.scheduler.start();

    this.logger.info("Content pipeline plugin started");
  }

  private async registerDashboardWidget(
    context: ServicePluginContext,
  ): Promise<void> {
    await context.messaging.send("dashboard:register-widget", {
      id: "publication-pipeline",
      pluginId: this.id,
      title: "Publication Pipeline",
      section: "secondary",
      priority: 100,
      rendererName: "PipelineWidget",
      dataProvider: async () => {
        const entityTypes = context.entityService.getEntityTypes();
        const allEntries: Array<{
          id: string;
          title: string;
          type: string;
          status: "draft" | "queued" | "published" | "failed";
        }> = [];
        const summary = { draft: 0, queued: 0, published: 0, failed: 0 };

        for (const entityType of entityTypes) {
          const entities = await context.entityService.listEntities(entityType);
          for (const entity of entities) {
            const status = entity.metadata["status"];
            if (
              status !== "draft" &&
              status !== "queued" &&
              status !== "published" &&
              status !== "failed"
            )
              continue;
            summary[status]++;
            const title = entity.metadata["title"];
            allEntries.push({
              id: entity.id,
              title: typeof title === "string" ? title : entity.id,
              type: entityType,
              status,
            });
          }
        }

        return { summary, items: allEntries };
      },
    });
  }

  protected override async getTools(): Promise<Tool[]> {
    if (!this.pluginContext) {
      throw new Error("Plugin context not initialized");
    }

    return [
      createQueueTool(this.pluginContext, this.id, this.queueManager),
      createPublishTool(this.pluginContext, this.id, this.providerRegistry),
    ];
  }

  protected override async getInstructions(): Promise<string | undefined> {
    return `## Publishing
- Use \`content-pipeline_queue\` to manage the publish queue — list queued items, add entities to the queue, remove them, or reorder.
- Use \`content-pipeline_publish\` to publish an entity directly to its platform (e.g. LinkedIn, Buttondown).
- When users ask about their "publish queue", "publishing queue", or "what's queued", use \`content-pipeline_queue\`.`;
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

  protected override async onShutdown(): Promise<void> {
    await this.scheduler.stop();
    QueueManager.resetInstance();
    ProviderRegistry.resetInstance();
    RetryTracker.resetInstance();
  }
}

export function contentPipelinePlugin(
  config?: Partial<ContentPipelineConfig>,
): ContentPipelinePlugin {
  return new ContentPipelinePlugin(config);
}
