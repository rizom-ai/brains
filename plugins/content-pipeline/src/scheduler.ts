/**
 * ContentScheduler - Cron-based scheduler for content pipeline queues
 *
 * Implements Component Interface Standardization pattern.
 * Uses croner for cron-based scheduling per entity type.
 *
 * Two modes:
 * 1. Provider mode (default): Calls provider.publish() directly
 * 2. Message mode: Emits publish:execute message for plugins to handle
 *
 * Also supports generation scheduling for automatic draft creation.
 */

import { Cron } from "croner";
import type { IMessageBus, ICoreEntityService } from "@brains/plugins";
import type { PublishResult } from "@brains/utils";
import type { QueueManager, QueueEntry } from "./queue-manager";
import type { ProviderRegistry } from "./provider-registry";
import type { RetryTracker } from "./retry-tracker";
import type { GenerationCondition } from "./types/config";
import { PUBLISH_MESSAGES, GENERATE_MESSAGES } from "./types/messages";

export interface PublishExecuteEvent {
  entityType: string;
  entityId: string;
}

export interface GenerateExecuteEvent {
  entityType: string;
}

export interface GenerationConditionResult {
  shouldGenerate: boolean;
  reason?: string;
}

export interface SchedulerConfig {
  queueManager: QueueManager;
  providerRegistry: ProviderRegistry;
  retryTracker: RetryTracker;
  /**
   * Per-entity-type publish schedules (cron syntax).
   * Entity types without a schedule are processed immediately (every second).
   */
  entitySchedules?: Record<string, string>;
  /**
   * Per-entity-type generation schedules (cron syntax).
   * Triggers automatic draft generation on schedule.
   */
  generationSchedules?: Record<string, string>;
  /**
   * Conditions that must be met before generating drafts.
   */
  generationConditions?: Record<string, GenerationCondition>;
  /** Optional message bus for message-driven publishing/generation */
  messageBus?: IMessageBus;
  /** Entity service for fetching entity content (required for provider mode) */
  entityService?: ICoreEntityService;
  /** Callback when entity is ready to publish (message mode) */
  onExecute?: (event: PublishExecuteEvent) => void;
  /** Callback on successful publish (provider mode) */
  onPublish?: (event: PublishSuccessEvent) => void;
  /** Callback on failed publish (provider mode) */
  onFailed?: (event: PublishFailedEvent) => void;
  /** Callback to check generation conditions */
  onCheckGenerationConditions?: (
    entityType: string,
    conditions: GenerationCondition,
  ) => Promise<GenerationConditionResult>;
  /** Callback when generation should be triggered */
  onGenerate?: (event: GenerateExecuteEvent) => void;
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

/** Interval for immediate processing (1 second) */
const IMMEDIATE_INTERVAL_MS = 1000;

export class ContentScheduler {
  private static instance: ContentScheduler | null = null;

  private queueManager: QueueManager;
  private providerRegistry: ProviderRegistry;
  private retryTracker: RetryTracker;
  private entitySchedules: Record<string, string>;
  private generationSchedules: Record<string, string>;
  private generationConditions: Record<string, GenerationCondition>;
  private publishCronJobs: Map<string, Cron> = new Map();
  private generationCronJobs: Map<string, Cron> = new Map();
  private immediateInterval: ReturnType<typeof setInterval> | null = null;
  private messageBus: IMessageBus | undefined;
  private entityService: ICoreEntityService | undefined;
  private onExecute: ((event: PublishExecuteEvent) => void) | undefined;
  private onPublish: ((event: PublishSuccessEvent) => void) | undefined;
  private onFailed: ((event: PublishFailedEvent) => void) | undefined;
  private onCheckGenerationConditions:
    | ((
        entityType: string,
        conditions: GenerationCondition,
      ) => Promise<GenerationConditionResult>)
    | undefined;
  private onGenerate: ((event: GenerateExecuteEvent) => void) | undefined;

  private running = false;

  /**
   * Get the singleton instance
   */
  public static getInstance(config: SchedulerConfig): ContentScheduler {
    ContentScheduler.instance ??= new ContentScheduler(config);
    return ContentScheduler.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    if (ContentScheduler.instance) {
      void ContentScheduler.instance.stop();
    }
    ContentScheduler.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(config: SchedulerConfig): ContentScheduler {
    return new ContentScheduler(config);
  }

  /**
   * Private constructor to enforce factory methods
   */
  private constructor(config: SchedulerConfig) {
    this.queueManager = config.queueManager;
    this.providerRegistry = config.providerRegistry;
    this.retryTracker = config.retryTracker;
    this.entitySchedules = config.entitySchedules ?? {};
    this.generationSchedules = config.generationSchedules ?? {};
    this.generationConditions = config.generationConditions ?? {};
    this.messageBus = config.messageBus;
    this.entityService = config.entityService;
    this.onExecute = config.onExecute;
    this.onPublish = config.onPublish;
    this.onFailed = config.onFailed;
    this.onCheckGenerationConditions = config.onCheckGenerationConditions;
    this.onGenerate = config.onGenerate;

    // Validate all cron expressions upfront
    this.validateCronExpressions();
  }

  /**
   * Validate all cron expressions
   */
  private validateCronExpressions(): void {
    // Validate publish schedules
    for (const [entityType, cronExpr] of Object.entries(this.entitySchedules)) {
      this.validateCronExpression(entityType, cronExpr, "publish");
    }

    // Validate generation schedules
    for (const [entityType, cronExpr] of Object.entries(
      this.generationSchedules,
    )) {
      this.validateCronExpression(entityType, cronExpr, "generation");
    }
  }

  private validateCronExpression(
    entityType: string,
    cronExpr: string,
    scheduleType: string,
  ): void {
    try {
      const testCron = new Cron(cronExpr);
      testCron.stop();
    } catch (error) {
      throw new Error(
        `Invalid ${scheduleType} cron expression for ${entityType}: "${cronExpr}" - ${error instanceof Error ? error.message : String(error)}`,
      );
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

    // Create publish cron jobs for each configured entity type
    for (const [entityType, cronExpr] of Object.entries(this.entitySchedules)) {
      const job = new Cron(cronExpr, () => {
        void this.processEntityType(entityType);
      });
      this.publishCronJobs.set(entityType, job);
    }

    // Create generation cron jobs for each configured entity type
    for (const [entityType, cronExpr] of Object.entries(
      this.generationSchedules,
    )) {
      const job = new Cron(cronExpr, () => {
        void this.triggerGeneration(entityType);
      });
      this.generationCronJobs.set(entityType, job);
    }

    // Create interval for entity types without schedules (immediate mode)
    this.immediateInterval = setInterval(() => {
      void this.processUnscheduledTypes();
    }, IMMEDIATE_INTERVAL_MS);
  }

  /**
   * Stop the scheduler
   */
  public async stop(): Promise<void> {
    this.running = false;

    // Stop all publish cron jobs
    for (const job of this.publishCronJobs.values()) {
      job.stop();
    }
    this.publishCronJobs.clear();

    // Stop all generation cron jobs
    for (const job of this.generationCronJobs.values()) {
      job.stop();
    }
    this.generationCronJobs.clear();

    // Stop immediate interval
    if (this.immediateInterval) {
      clearInterval(this.immediateInterval);
      this.immediateInterval = null;
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

    // Fetch entity content using entityService
    if (!this.entityService) {
      const errorMessage = "EntityService not available for provider mode";
      this.onFailed?.({
        entityType: entry.entityType,
        entityId: entry.entityId,
        error: errorMessage,
        retryCount: 0,
        willRetry: false,
      });
      return;
    }

    const entity = await this.entityService.getEntity(
      entry.entityType,
      entry.entityId,
    );

    if (!entity) {
      const errorMessage = `Entity not found: ${entry.entityType}/${entry.entityId}`;
      this.onFailed?.({
        entityType: entry.entityType,
        entityId: entry.entityId,
        error: errorMessage,
        retryCount: 0,
        willRetry: false,
      });
      return;
    }

    try {
      const result = await provider.publish(entity.content, entity.metadata);

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

  // ============================================
  // Generation Scheduling Methods
  // ============================================

  /**
   * Trigger generation for an entity type (called by generation cron job)
   */
  private async triggerGeneration(entityType: string): Promise<void> {
    if (!this.running) return;

    try {
      // Check conditions if configured
      const conditions = this.generationConditions[entityType];
      if (conditions && this.onCheckGenerationConditions) {
        const result = await this.onCheckGenerationConditions(
          entityType,
          conditions,
        );

        if (!result.shouldGenerate) {
          // Emit skipped message
          if (this.messageBus) {
            void this.messageBus.send(
              GENERATE_MESSAGES.SKIPPED,
              { entityType, reason: result.reason ?? "Conditions not met" },
              "content-pipeline",
            );
          }
          return;
        }
      }

      // Emit generate:execute message
      const event: GenerateExecuteEvent = { entityType };

      if (this.messageBus) {
        await this.messageBus.send(
          GENERATE_MESSAGES.EXECUTE,
          event,
          "content-pipeline",
        );
      }

      // Call callback
      this.onGenerate?.(event);
    } catch (error) {
      console.error(`Generation trigger error for ${entityType}:`, error);
    }
  }

  /**
   * Report successful generation (called by plugin after creating draft)
   */
  public completeGeneration(entityType: string, entityId: string): void {
    if (this.messageBus) {
      void this.messageBus.send(
        GENERATE_MESSAGES.COMPLETED,
        { entityType, entityId },
        "content-pipeline",
      );
    }
  }

  /**
   * Report failed generation
   */
  public failGeneration(entityType: string, error: string): void {
    if (this.messageBus) {
      void this.messageBus.send(
        GENERATE_MESSAGES.FAILED,
        { entityType, error },
        "content-pipeline",
      );
    }
  }
}
