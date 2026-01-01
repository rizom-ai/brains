/**
 * PublishService - Main service for managing publishing pipeline
 *
 * Implements Component Interface Standardization pattern.
 * Integrates with message bus for plugin communication.
 */

import type {
  IMessageBus,
  MessageWithPayload,
} from "@brains/messaging-service";
import type { Logger } from "@brains/utils";
import { QueueManager } from "./queue-manager";
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
} from "./types/messages";
import type { PublishProvider } from "./types/provider";

export interface PublishServiceConfig {
  messageBus: IMessageBus;
  logger: Logger;
  tickIntervalMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

export class PublishService {
  private static instance: PublishService | null = null;

  private messageBus: IMessageBus;
  private logger: Logger;
  private queueManager: QueueManager;
  private providerRegistry: ProviderRegistry;
  private retryTracker: RetryTracker;
  private scheduler: PublishScheduler;
  private unsubscribers: Array<() => void> = [];

  /**
   * Get the singleton instance
   */
  public static getInstance(config: PublishServiceConfig): PublishService {
    PublishService.instance ??= new PublishService(config);
    return PublishService.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    if (PublishService.instance) {
      void PublishService.instance.stop();
    }
    PublishService.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(config: PublishServiceConfig): PublishService {
    return new PublishService(config);
  }

  /**
   * Private constructor to enforce factory methods
   */
  private constructor(config: PublishServiceConfig) {
    this.messageBus = config.messageBus;
    this.logger = config.logger.child("PublishService");

    // Initialize components
    this.queueManager = QueueManager.createFresh();
    this.providerRegistry = ProviderRegistry.createFresh();
    this.retryTracker = RetryTracker.createFresh({
      maxRetries: config.maxRetries ?? 3,
      baseDelayMs: config.retryBaseDelayMs ?? 5000,
    });

    this.scheduler = PublishScheduler.createFresh({
      queueManager: this.queueManager,
      providerRegistry: this.providerRegistry,
      retryTracker: this.retryTracker,
      tickIntervalMs: config.tickIntervalMs ?? 60000,
      onPublish: (event) => this.handlePublishSuccess(event),
      onFailed: (event) => this.handlePublishFailed(event),
    });
  }

  /**
   * Start the service and subscribe to messages
   */
  public async start(): Promise<void> {
    this.logger.info("Starting publish service");

    // Subscribe to message bus events
    this.subscribeToMessages();

    // Start the scheduler
    await this.scheduler.start();

    this.logger.info("Publish service started");
  }

  /**
   * Stop the service
   */
  public async stop(): Promise<void> {
    this.logger.info("Stopping publish service");

    // Stop the scheduler
    await this.scheduler.stop();

    // Unsubscribe from all messages
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];

    this.logger.info("Publish service stopped");
  }

  /**
   * Subscribe to all message bus events
   */
  private subscribeToMessages(): void {
    // Register handler
    this.unsubscribers.push(
      this.messageBus.subscribe<PublishRegisterPayload>(
        PUBLISH_MESSAGES.REGISTER,
        async (msg) => this.handleRegister(msg),
      ),
    );

    // Queue handler
    this.unsubscribers.push(
      this.messageBus.subscribe<PublishQueuePayload>(
        PUBLISH_MESSAGES.QUEUE,
        async (msg) => this.handleQueue(msg),
      ),
    );

    // Direct publish handler
    this.unsubscribers.push(
      this.messageBus.subscribe<PublishDirectPayload>(
        PUBLISH_MESSAGES.DIRECT,
        async (msg) => this.handleDirect(msg),
      ),
    );

    // Remove handler
    this.unsubscribers.push(
      this.messageBus.subscribe<PublishRemovePayload>(
        PUBLISH_MESSAGES.REMOVE,
        async (msg) => this.handleRemove(msg),
      ),
    );

    // Reorder handler
    this.unsubscribers.push(
      this.messageBus.subscribe<PublishReorderPayload>(
        PUBLISH_MESSAGES.REORDER,
        async (msg) => this.handleReorder(msg),
      ),
    );

    // List handler
    this.unsubscribers.push(
      this.messageBus.subscribe<PublishListPayload>(
        PUBLISH_MESSAGES.LIST,
        async (msg) => this.handleList(msg),
      ),
    );

    this.logger.debug("Subscribed to publish messages");
  }

  /**
   * Handle publish:register message
   */
  private async handleRegister(
    msg: MessageWithPayload<PublishRegisterPayload>,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const { entityType, provider } = msg.payload;

    try {
      if (provider) {
        this.providerRegistry.register(entityType, provider);
        this.logger.info(`Registered provider for entity type: ${entityType}`, {
          providerName: provider.name,
        });
      }

      return { success: true, data: { entityType, registered: true } };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to register provider: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle publish:queue message
   */
  private async handleQueue(
    msg: MessageWithPayload<PublishQueuePayload>,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const { entityType, entityId } = msg.payload;

    try {
      const result = await this.queueManager.add(entityType, entityId);

      // Send queued notification
      await this.messageBus.send(
        PUBLISH_MESSAGES.QUEUED,
        { entityType, entityId, position: result.position },
        "publish-service",
      );

      this.logger.debug(`Entity queued: ${entityId}`, {
        entityType,
        position: result.position,
      });

      return { success: true, data: { position: result.position } };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to queue entity: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle publish:direct message
   */
  private async handleDirect(
    msg: MessageWithPayload<PublishDirectPayload>,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const { entityType, entityId } = msg.payload;

    try {
      // TODO: Fetch entity content from entity service
      // For now, pass empty content - the provider needs to fetch it
      const result = await this.scheduler.publishDirect(
        entityType,
        entityId,
        "",
        {},
      );

      // Send completed notification
      await this.messageBus.send(
        PUBLISH_MESSAGES.COMPLETED,
        { entityType, entityId, result },
        "publish-service",
      );

      this.logger.info(`Direct publish completed: ${entityId}`, { entityType });

      return { success: true, data: result };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Direct publish failed: ${errorMessage}`);

      // Send failed notification
      await this.messageBus.send(
        PUBLISH_MESSAGES.FAILED,
        {
          entityType,
          entityId,
          error: errorMessage,
          retryCount: 0,
          willRetry: false,
        },
        "publish-service",
      );

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle publish:remove message
   */
  private async handleRemove(
    msg: MessageWithPayload<PublishRemovePayload>,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const { entityType, entityId } = msg.payload;

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
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle publish:reorder message
   */
  private async handleReorder(
    msg: MessageWithPayload<PublishReorderPayload>,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const { entityType, entityId, position } = msg.payload;

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
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle publish:list message
   */
  private async handleList(
    msg: MessageWithPayload<PublishListPayload>,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const { entityType } = msg.payload;

    try {
      const queue = await this.queueManager.list(entityType);

      // Send list response
      await this.messageBus.send(
        PUBLISH_MESSAGES.LIST_RESPONSE,
        {
          entityType,
          queue: queue.map((entry) => ({
            entityId: entry.entityId,
            position: entry.position,
            queuedAt: entry.queuedAt,
          })),
        },
        "publish-service",
      );

      return { success: true, data: { count: queue.length } };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to list queue: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle successful publish from scheduler
   */
  private handlePublishSuccess(event: {
    entityType: string;
    entityId: string;
    result: { id: string; url?: string };
  }): void {
    void this.messageBus.send(
      PUBLISH_MESSAGES.COMPLETED,
      {
        entityType: event.entityType,
        entityId: event.entityId,
        result: event.result,
      },
      "publish-service",
    );
  }

  /**
   * Handle failed publish from scheduler
   */
  private handlePublishFailed(event: {
    entityType: string;
    entityId: string;
    error: string;
    retryCount: number;
    willRetry: boolean;
  }): void {
    void this.messageBus.send(
      PUBLISH_MESSAGES.FAILED,
      {
        entityType: event.entityType,
        entityId: event.entityId,
        error: event.error,
        retryCount: event.retryCount,
        willRetry: event.willRetry,
      },
      "publish-service",
    );
  }

  // Expose components for testing
  public getQueueManager(): QueueManager {
    return this.queueManager;
  }

  public getProviderRegistry(): ProviderRegistry {
    return this.providerRegistry;
  }

  public getScheduler(): PublishScheduler {
    return this.scheduler;
  }

  /**
   * Register a provider directly (for testing or programmatic use)
   */
  public registerProvider(entityType: string, provider: PublishProvider): void {
    this.providerRegistry.register(entityType, provider);
  }
}
