/**
 * PublishPipelinePlugin - Plugin for managing publishing pipeline
 *
 * Provides centralized queue management, scheduling, and retry logic
 * for all publishable entity types via message-driven architecture.
 */

import type { Plugin, PluginTool, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { QueueManager } from "./queue-manager";
import { createQueueTool } from "./tools/queue";
import { createPublishTool } from "./tools/publish";
import { ProviderRegistry } from "./provider-registry";
import { RetryTracker } from "./retry-tracker";
import { PublishScheduler } from "./scheduler";
import { PUBLISH_MESSAGES } from "./types/messages";
import type {
  PublishRegisterPayload,
  PublishQueuePayload,
  PublishDirectPayload,
  PublishRemovePayload,
  PublishReorderPayload,
  PublishListPayload,
  PublishReportSuccessPayload,
  PublishReportFailurePayload,
} from "./types/messages";
import type { PublishPipelineConfig } from "./types/config";
import { publishPipelineConfigSchema } from "./types/config";
import packageJson from "../package.json";

/**
 * Publish Pipeline Plugin
 * Manages entity publishing queues and scheduling
 */
export class PublishPipelinePlugin extends ServicePlugin<PublishPipelineConfig> {
  private pluginContext?: ServicePluginContext;
  private queueManager!: QueueManager;
  private providerRegistry!: ProviderRegistry;
  private retryTracker!: RetryTracker;
  private scheduler!: PublishScheduler;

  constructor(config?: Partial<PublishPipelineConfig>) {
    super(
      "publish-pipeline",
      packageJson,
      config ?? {},
      publishPipelineConfigSchema,
    );
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.pluginContext = context;

    // Initialize components
    this.queueManager = QueueManager.createFresh();
    this.providerRegistry = ProviderRegistry.createFresh();
    this.retryTracker = RetryTracker.createFresh({
      maxRetries: this.config.maxRetries,
      baseDelayMs: this.config.retryBaseDelayMs,
    });

    // Create a messageBus adapter for the scheduler
    const messageBusAdapter = {
      send: async (channel: string, message: unknown): Promise<unknown> => {
        return context.messaging.send(channel, message);
      },
      subscribe: (): (() => void) => () => {},
    };

    this.scheduler = PublishScheduler.createFresh({
      queueManager: this.queueManager,
      providerRegistry: this.providerRegistry,
      retryTracker: this.retryTracker,
      ...(this.config.entitySchedules && {
        entitySchedules: this.config.entitySchedules,
      }),
      messageBus: messageBusAdapter as never,
      onPublish: (event) => this.handlePublishSuccess(context, event),
      onFailed: (event) => this.handlePublishFailed(context, event),
    });

    // Subscribe to message bus events
    this.subscribeToMessages(context);

    // Start the scheduler
    await this.scheduler.start();

    this.logger.info("Publish pipeline plugin started");
  }

  private subscribeToMessages(context: ServicePluginContext): void {
    context.messaging.subscribe<PublishRegisterPayload, { success: boolean }>(
      PUBLISH_MESSAGES.REGISTER,
      async (msg) => this.handleRegister(msg.payload),
    );

    context.messaging.subscribe<PublishQueuePayload, { success: boolean }>(
      PUBLISH_MESSAGES.QUEUE,
      async (msg) => this.handleQueue(context, msg.payload),
    );

    context.messaging.subscribe<PublishDirectPayload, { success: boolean }>(
      PUBLISH_MESSAGES.DIRECT,
      async (msg) => this.handleDirect(context, msg.payload),
    );

    context.messaging.subscribe<PublishRemovePayload, { success: boolean }>(
      PUBLISH_MESSAGES.REMOVE,
      async (msg) => this.handleRemove(msg.payload),
    );

    context.messaging.subscribe<PublishReorderPayload, { success: boolean }>(
      PUBLISH_MESSAGES.REORDER,
      async (msg) => this.handleReorder(msg.payload),
    );

    context.messaging.subscribe<PublishListPayload, { success: boolean }>(
      PUBLISH_MESSAGES.LIST,
      async (msg) => this.handleList(context, msg.payload),
    );

    context.messaging.subscribe<
      PublishReportSuccessPayload,
      { success: boolean }
    >(PUBLISH_MESSAGES.REPORT_SUCCESS, async (msg) =>
      this.handleReportSuccess(context, msg.payload),
    );

    context.messaging.subscribe<
      PublishReportFailurePayload,
      { success: boolean }
    >(PUBLISH_MESSAGES.REPORT_FAILURE, async (msg) =>
      this.handleReportFailure(context, msg.payload),
    );

    this.logger.debug("Subscribed to publish messages");
  }

  private async handleRegister(
    payload: PublishRegisterPayload,
  ): Promise<{ success: boolean }> {
    const { entityType, provider } = payload;

    try {
      if (provider) {
        this.providerRegistry.register(entityType, provider);
        this.logger.info(`Registered provider for entity type: ${entityType}`, {
          providerName: provider.name,
        });
      }
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to register provider: ${errorMessage}`);
      return { success: false };
    }
  }

  private async handleQueue(
    context: ServicePluginContext,
    payload: PublishQueuePayload,
  ): Promise<{ success: boolean }> {
    const { entityType, entityId } = payload;

    try {
      const result = await this.queueManager.add(entityType, entityId);

      await context.messaging.send(PUBLISH_MESSAGES.QUEUED, {
        entityType,
        entityId,
        position: result.position,
      });

      this.logger.debug(`Entity queued: ${entityId}`, {
        entityType,
        position: result.position,
      });

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to queue entity: ${errorMessage}`);
      return { success: false };
    }
  }

  private async handleDirect(
    context: ServicePluginContext,
    payload: PublishDirectPayload,
  ): Promise<{ success: boolean }> {
    const { entityType, entityId } = payload;

    await context.messaging.send(PUBLISH_MESSAGES.EXECUTE, {
      entityType,
      entityId,
    });

    this.logger.debug(`Direct publish requested: ${entityId}`, { entityType });

    return { success: true };
  }

  private async handleRemove(
    payload: PublishRemovePayload,
  ): Promise<{ success: boolean }> {
    const { entityType, entityId } = payload;

    try {
      await this.queueManager.remove(entityType, entityId);
      this.logger.debug(`Entity removed from queue: ${entityId}`, {
        entityType,
      });
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to remove entity: ${errorMessage}`);
      return { success: false };
    }
  }

  private async handleReorder(
    payload: PublishReorderPayload,
  ): Promise<{ success: boolean }> {
    const { entityType, entityId, position } = payload;

    try {
      await this.queueManager.reorder(entityType, entityId, position);
      this.logger.debug(`Entity reordered: ${entityId}`, {
        entityType,
        newPosition: position,
      });
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to reorder entity: ${errorMessage}`);
      return { success: false };
    }
  }

  private async handleList(
    context: ServicePluginContext,
    payload: PublishListPayload,
  ): Promise<{ success: boolean }> {
    const { entityType } = payload;

    try {
      const queue = await this.queueManager.list(entityType);

      await context.messaging.send(PUBLISH_MESSAGES.LIST_RESPONSE, {
        entityType,
        queue: queue.map((entry) => ({
          entityId: entry.entityId,
          position: entry.position,
          queuedAt: entry.queuedAt,
        })),
      });

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to list queue: ${errorMessage}`);
      return { success: false };
    }
  }

  private handlePublishSuccess(
    context: ServicePluginContext,
    event: {
      entityType: string;
      entityId: string;
      result: { id: string; url?: string };
    },
  ): void {
    void context.messaging.send(PUBLISH_MESSAGES.COMPLETED, {
      entityType: event.entityType,
      entityId: event.entityId,
      result: event.result,
    });
  }

  private handlePublishFailed(
    context: ServicePluginContext,
    event: {
      entityType: string;
      entityId: string;
      error: string;
      retryCount: number;
      willRetry: boolean;
    },
  ): void {
    void context.messaging.send(PUBLISH_MESSAGES.FAILED, {
      entityType: event.entityType,
      entityId: event.entityId,
      error: event.error,
      retryCount: event.retryCount,
      willRetry: event.willRetry,
    });
  }

  private async handleReportSuccess(
    context: ServicePluginContext,
    payload: PublishReportSuccessPayload,
  ): Promise<{ success: boolean }> {
    const { entityType, entityId, result } = payload;

    this.retryTracker.clearRetries(entityId);

    await context.messaging.send(PUBLISH_MESSAGES.COMPLETED, {
      entityType,
      entityId,
      result,
    });

    this.logger.info(`Publish reported success: ${entityId}`, { entityType });

    return { success: true };
  }

  private async handleReportFailure(
    context: ServicePluginContext,
    payload: PublishReportFailurePayload,
  ): Promise<{ success: boolean }> {
    const { entityType, entityId, error } = payload;

    this.retryTracker.recordFailure(entityId, error);
    const retryInfo = this.retryTracker.getRetryInfo(entityId);

    await context.messaging.send(PUBLISH_MESSAGES.FAILED, {
      entityType,
      entityId,
      error,
      retryCount: retryInfo?.retryCount ?? 1,
      willRetry: retryInfo?.willRetry ?? false,
    });

    this.logger.info(`Publish reported failure: ${entityId}`, {
      entityType,
      error,
      retryCount: retryInfo?.retryCount,
      willRetry: retryInfo?.willRetry,
    });

    return { success: true };
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
    this.logger.info("Publish pipeline plugin stopped");
  }

  // Expose components for testing
  public getQueueManager(): QueueManager {
    return this.queueManager;
  }

  public getProviderRegistry(): ProviderRegistry {
    return this.providerRegistry;
  }

  public getRetryTracker(): RetryTracker {
    return this.retryTracker;
  }

  public getScheduler(): PublishScheduler {
    return this.scheduler;
  }
}

/**
 * Factory function to create the plugin
 */
export function publishPipelinePlugin(
  config?: Partial<PublishPipelineConfig>,
): Plugin {
  return new PublishPipelinePlugin(config);
}
