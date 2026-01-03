/**
 * PublishScheduler - Cron-based scheduler for publish queues
 *
 * Implements Component Interface Standardization pattern.
 * Uses croner for cron-based scheduling per entity type.
 *
 * Two modes:
 * 1. Provider mode (default): Calls provider.publish() directly
 * 2. Message mode: Emits publish:execute message for plugins to handle
 */

import { Cron } from "croner";
import type { IMessageBus } from "@brains/messaging-service";
import type { PublishResult } from "@brains/utils";
import type { QueueManager, QueueEntry } from "./queue-manager";
import type { ProviderRegistry } from "./provider-registry";
import type { RetryTracker } from "./retry-tracker";
import { PUBLISH_MESSAGES } from "./types/messages";

export interface PublishExecuteEvent {
  entityType: string;
  entityId: string;
}

export interface SchedulerConfig {
  queueManager: QueueManager;
  providerRegistry: ProviderRegistry;
  retryTracker: RetryTracker;
  /**
   * Per-entity-type cron schedules.
   * Entity types without a schedule are processed immediately (every second).
   */
  entitySchedules?: Record<string, string>;
  /** Optional message bus for message-driven publishing */
  messageBus?: IMessageBus;
  /** Callback when entity is ready to publish (message mode) */
  onExecute?: (event: PublishExecuteEvent) => void;
  /** Callback on successful publish (provider mode) */
  onPublish?: (event: PublishSuccessEvent) => void;
  /** Callback on failed publish (provider mode) */
  onFailed?: (event: PublishFailedEvent) => void;
}

export interface PublishSuccessEvent {
  entityType: string;
  entityId: string;
  result: PublishResult;
}

export interface PublishFailedEvent {
  entityType: string;
  entityId: string;
  error: string;
  retryCount: number;
  willRetry: boolean;
}

/** Default cron for immediate processing (every second) */
const IMMEDIATE_CRON = "* * * * * *";

export class PublishScheduler {
  private static instance: PublishScheduler | null = null;

  private queueManager: QueueManager;
  private providerRegistry: ProviderRegistry;
  private retryTracker: RetryTracker;
  private entitySchedules: Record<string, string>;
  private cronJobs: Map<string, Cron> = new Map();
  private immediateCron: Cron | null = null;
  private messageBus: IMessageBus | undefined;
  private onExecute: ((event: PublishExecuteEvent) => void) | undefined;
  private onPublish: ((event: PublishSuccessEvent) => void) | undefined;
  private onFailed: ((event: PublishFailedEvent) => void) | undefined;

  private running = false;

  /**
   * Get the singleton instance
   */
  public static getInstance(config: SchedulerConfig): PublishScheduler {
    PublishScheduler.instance ??= new PublishScheduler(config);
    return PublishScheduler.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    if (PublishScheduler.instance) {
      void PublishScheduler.instance.stop();
    }
    PublishScheduler.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(config: SchedulerConfig): PublishScheduler {
    return new PublishScheduler(config);
  }

  /**
   * Private constructor to enforce factory methods
   */
  private constructor(config: SchedulerConfig) {
    this.queueManager = config.queueManager;
    this.providerRegistry = config.providerRegistry;
    this.retryTracker = config.retryTracker;
    this.entitySchedules = config.entitySchedules ?? {};
    this.messageBus = config.messageBus;
    this.onExecute = config.onExecute;
    this.onPublish = config.onPublish;
    this.onFailed = config.onFailed;

    // Validate all cron expressions upfront
    this.validateCronExpressions();
  }

  /**
   * Validate all cron expressions
   */
  private validateCronExpressions(): void {
    for (const [entityType, cronExpr] of Object.entries(this.entitySchedules)) {
      try {
        // Try to create a cron to validate the expression
        const testCron = new Cron(cronExpr);
        testCron.stop();
      } catch (error) {
        throw new Error(
          `Invalid cron expression for ${entityType}: "${cronExpr}" - ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Check if running in message-driven mode
   */
  private isMessageMode(): boolean {
    return this.messageBus !== undefined;
  }

  /**
   * Start the scheduler
   */
  public async start(): Promise<void> {
    if (this.running) return;

    this.running = true;

    // Create cron jobs for each configured entity type
    for (const [entityType, cronExpr] of Object.entries(this.entitySchedules)) {
      const job = new Cron(cronExpr, () => {
        void this.processEntityType(entityType);
      });
      this.cronJobs.set(entityType, job);
    }

    // Create a default cron for entity types without schedules (immediate mode)
    this.immediateCron = new Cron(IMMEDIATE_CRON, () => {
      void this.processUnscheduledTypes();
    });
  }

  /**
   * Stop the scheduler
   */
  public async stop(): Promise<void> {
    this.running = false;

    // Stop all cron jobs
    for (const job of this.cronJobs.values()) {
      job.stop();
    }
    this.cronJobs.clear();

    // Stop immediate cron
    if (this.immediateCron) {
      this.immediateCron.stop();
      this.immediateCron = null;
    }
  }

  /**
   * Check if scheduler is running
   */
  public isRunning(): boolean {
    return this.running;
  }

  /**
   * Process a specific entity type (called by its cron job)
   */
  private async processEntityType(entityType: string): Promise<void> {
    if (!this.running) return;

    try {
      const next = await this.queueManager.getNext(entityType);
      if (next) {
        await this.processEntry(next);
      }
    } catch (error) {
      console.error(`Scheduler error for ${entityType}:`, error);
    }
  }

  /**
   * Process entity types that don't have a cron schedule (immediate mode)
   */
  private async processUnscheduledTypes(): Promise<void> {
    if (!this.running) return;

    try {
      const queuedTypes = await this.queueManager.getQueuedEntityTypes();

      // Find types without a schedule
      for (const entityType of queuedTypes) {
        if (!this.entitySchedules[entityType]) {
          const next = await this.queueManager.getNext(entityType);
          if (next) {
            await this.processEntry(next);
            break; // Process one item per tick
          }
        }
      }
    } catch (error) {
      console.error("Scheduler error for unscheduled types:", error);
    }
  }

  /**
   * Process a queue entry - either emit message or call provider
   */
  private async processEntry(entry: QueueEntry): Promise<void> {
    // Remove from queue first
    await this.queueManager.remove(entry.entityType, entry.entityId);

    if (this.isMessageMode()) {
      // Message mode: emit execute message for plugin to handle
      await this.emitExecute(entry);
    } else {
      // Provider mode: call provider directly
      await this.executeWithProvider(entry);
    }
  }

  /**
   * Emit publish:execute message (message mode)
   */
  private async emitExecute(entry: QueueEntry): Promise<void> {
    const event: PublishExecuteEvent = {
      entityType: entry.entityType,
      entityId: entry.entityId,
    };

    // Send message
    if (this.messageBus) {
      await this.messageBus.send(
        PUBLISH_MESSAGES.EXECUTE,
        event,
        "publish-service",
      );
    }

    // Call callback
    this.onExecute?.(event);
  }

  /**
   * Execute publishing with provider (provider mode)
   */
  private async executeWithProvider(entry: QueueEntry): Promise<void> {
    const provider = this.providerRegistry.get(entry.entityType);

    try {
      // TODO: In the full implementation, we need to fetch entity content
      // For now, pass empty content - plugins will need to provide content
      const result = await provider.publish("", {});

      // Clear any retry info
      this.retryTracker.clearRetries(entry.entityId);

      // Notify success
      this.onPublish?.({
        entityType: entry.entityType,
        entityId: entry.entityId,
        result,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Record failure for retry tracking
      this.retryTracker.recordFailure(entry.entityId, errorMessage);
      const retryInfo = this.retryTracker.getRetryInfo(entry.entityId);

      // Notify failure
      this.onFailed?.({
        entityType: entry.entityType,
        entityId: entry.entityId,
        error: errorMessage,
        retryCount: retryInfo?.retryCount ?? 1,
        willRetry: retryInfo?.willRetry ?? false,
      });
    }
  }

  /**
   * Report successful publish (called by plugin in message mode)
   */
  public completePublish(
    entityType: string,
    entityId: string,
    result: PublishResult,
  ): void {
    // Clear retry info
    this.retryTracker.clearRetries(entityId);

    // Send completed message
    if (this.messageBus) {
      void this.messageBus.send(
        PUBLISH_MESSAGES.COMPLETED,
        { entityType, entityId, result },
        "publish-service",
      );
    }

    // Call callback
    this.onPublish?.({ entityType, entityId, result });
  }

  /**
   * Report failed publish (called by plugin in message mode)
   */
  public failPublish(
    entityType: string,
    entityId: string,
    error: string,
  ): void {
    // Record failure
    this.retryTracker.recordFailure(entityId, error);
    const retryInfo = this.retryTracker.getRetryInfo(entityId);

    const event: PublishFailedEvent = {
      entityType,
      entityId,
      error,
      retryCount: retryInfo?.retryCount ?? 1,
      willRetry: retryInfo?.willRetry ?? false,
    };

    // Send failed message
    if (this.messageBus) {
      void this.messageBus.send(
        PUBLISH_MESSAGES.FAILED,
        event,
        "publish-service",
      );
    }

    // Call callback
    this.onFailed?.(event);
  }

  /**
   * Publish an entity directly (bypass queue)
   */
  public async publishDirect(
    entityType: string,
    _entityId: string,
    content: string,
    metadata: Record<string, unknown>,
  ): Promise<PublishResult> {
    const provider = this.providerRegistry.get(entityType);
    return provider.publish(content, metadata);
  }
}
