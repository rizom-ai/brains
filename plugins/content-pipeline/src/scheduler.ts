/**
 * ContentScheduler - Cron-based scheduler for content pipeline queues
 *
 * Implements Component Interface Standardization pattern.
 * Uses a pluggable backend for scheduling (defaults to croner).
 *
 * Two modes:
 * 1. Provider mode (default): Calls provider.publish() directly
 * 2. Message mode: Emits publish:execute message for plugins to handle
 *
 * Also supports generation scheduling for automatic draft creation.
 */

import type { PublishResult } from "@brains/utils";
import type { QueueEntry } from "./queue-manager";
import type { ScheduledJob } from "./scheduler-backend";
import {
  emitPublishExecute,
  executeWithProvider,
  sendPublishCompleted,
  sendPublishFailed,
} from "./scheduler-publish";
import type { PublishDeps } from "./scheduler-publish";
import {
  triggerGeneration,
  sendGenerationCompleted,
  sendGenerationFailed,
} from "./scheduler-generation";
import type { GenerationDeps } from "./scheduler-generation";
import type { SchedulerConfig } from "./types/scheduler";

// Re-export all types from types/scheduler for backward compatibility
export type {
  SchedulerConfig,
  PublishExecuteEvent,
  GenerateExecuteEvent,
  GenerationConditionResult,
  PublishSuccessEvent,
  PublishFailedEvent,
} from "./types/scheduler";

/** Interval for immediate processing (1 second) */
const IMMEDIATE_INTERVAL_MS = 1000;

export class ContentScheduler {
  private static instance: ContentScheduler | null = null;

  private config: SchedulerConfig;
  private publishJobs: Map<string, ScheduledJob> = new Map();
  private generationJobs: Map<string, ScheduledJob> = new Map();
  private immediateIntervalJob: ScheduledJob | null = null;
  private running = false;

  public static getInstance(config: SchedulerConfig): ContentScheduler {
    ContentScheduler.instance ??= new ContentScheduler(config);
    return ContentScheduler.instance;
  }

  public static resetInstance(): void {
    if (ContentScheduler.instance) {
      void ContentScheduler.instance.stop();
    }
    ContentScheduler.instance = null;
  }

  public static createFresh(config: SchedulerConfig): ContentScheduler {
    return new ContentScheduler(config);
  }

  private constructor(config: SchedulerConfig) {
    this.config = {
      ...config,
      entitySchedules: config.entitySchedules ?? {},
      generationSchedules: config.generationSchedules ?? {},
      generationConditions: config.generationConditions ?? {},
    };

    this.validateCronExpressions();
  }

  // -------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------

  public async start(): Promise<void> {
    if (this.running) return;

    this.running = true;

    for (const [entityType, cronExpr] of Object.entries(this.entitySchedules)) {
      const job = this.config.backend.scheduleCron(cronExpr, () =>
        this.processEntityType(entityType),
      );
      this.publishJobs.set(entityType, job);
    }

    for (const [entityType, cronExpr] of Object.entries(
      this.generationSchedules,
    )) {
      const job = this.config.backend.scheduleCron(cronExpr, () =>
        this.handleTriggerGeneration(entityType),
      );
      this.generationJobs.set(entityType, job);
    }

    this.immediateIntervalJob = this.config.backend.scheduleInterval(
      IMMEDIATE_INTERVAL_MS,
      () => this.processUnscheduledTypes(),
    );
  }

  public async stop(): Promise<void> {
    this.running = false;

    for (const job of this.publishJobs.values()) {
      job.stop();
    }
    this.publishJobs.clear();

    for (const job of this.generationJobs.values()) {
      job.stop();
    }
    this.generationJobs.clear();

    if (this.immediateIntervalJob) {
      this.immediateIntervalJob.stop();
      this.immediateIntervalJob = null;
    }
  }

  public isRunning(): boolean {
    return this.running;
  }

  // -------------------------------------------------------------------
  // Queue processing
  // -------------------------------------------------------------------

  private async processEntityType(entityType: string): Promise<void> {
    if (!this.running) return;

    try {
      const next = await this.config.queueManager.getNext(entityType);
      if (next) {
        await this.processEntry(next);
      }
    } catch (error) {
      this.config.logger.error(`Scheduler error for ${entityType}:`, error);
    }
  }

  private async processUnscheduledTypes(): Promise<void> {
    if (!this.running) return;

    try {
      const queuedTypes = await this.config.queueManager.getQueuedEntityTypes();

      for (const entityType of queuedTypes) {
        if (!this.entitySchedules[entityType]) {
          const next = await this.config.queueManager.getNext(entityType);
          if (next) {
            await this.processEntry(next);
            break;
          }
        }
      }
    } catch (error) {
      this.config.logger.error("Scheduler error for unscheduled types:", error);
    }
  }

  private async processEntry(entry: QueueEntry): Promise<void> {
    await this.config.queueManager.remove(entry.entityType, entry.entityId);

    if (this.config.messageBus !== undefined) {
      await emitPublishExecute(entry, this.publishDeps);
    } else {
      await executeWithProvider(entry, this.publishDeps);
    }
  }

  // -------------------------------------------------------------------
  // Public publish reporting (message mode)
  // -------------------------------------------------------------------

  public completePublish(
    entityType: string,
    entityId: string,
    result: PublishResult,
  ): void {
    sendPublishCompleted(entityType, entityId, result, this.publishDeps);
  }

  public failPublish(
    entityType: string,
    entityId: string,
    error: string,
  ): void {
    sendPublishFailed(entityType, entityId, error, this.publishDeps);
  }

  public async publishDirect(
    entityType: string,
    _entityId: string,
    content: string,
    metadata: Record<string, unknown>,
  ): Promise<PublishResult> {
    const provider = this.config.providerRegistry.get(entityType);
    return provider.publish(content, metadata);
  }

  // -------------------------------------------------------------------
  // Generation scheduling
  // -------------------------------------------------------------------

  private async handleTriggerGeneration(entityType: string): Promise<void> {
    if (!this.running) return;

    try {
      await triggerGeneration(entityType, this.generationDeps);
    } catch (error) {
      this.config.logger.error(
        `Generation trigger error for ${entityType}:`,
        error,
      );
    }
  }

  public completeGeneration(entityType: string, entityId: string): void {
    sendGenerationCompleted(entityType, entityId, this.config.messageBus);
  }

  public failGeneration(entityType: string, error: string): void {
    sendGenerationFailed(entityType, error, this.config.messageBus);
  }

  // -------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------

  private get entitySchedules(): Record<string, string> {
    return this.config.entitySchedules as Record<string, string>;
  }

  private get generationSchedules(): Record<string, string> {
    return this.config.generationSchedules as Record<string, string>;
  }

  private get publishDeps(): PublishDeps {
    return {
      providerRegistry: this.config.providerRegistry,
      retryTracker: this.config.retryTracker,
      messageBus: this.config.messageBus,
      entityService: this.config.entityService,
      onExecute: this.config.onExecute,
      onPublish: this.config.onPublish,
      onFailed: this.config.onFailed,
    };
  }

  private get generationDeps(): GenerationDeps {
    return {
      logger: this.config.logger,
      messageBus: this.config.messageBus,
      generationConditions: this.config.generationConditions as Record<
        string,
        import("./types/config").GenerationCondition
      >,
      onCheckGenerationConditions: this.config.onCheckGenerationConditions,
      onGenerate: this.config.onGenerate,
    };
  }

  private validateCronExpressions(): void {
    for (const [entityType, cronExpr] of Object.entries(this.entitySchedules)) {
      this.validateCronExpression(entityType, cronExpr, "publish");
    }

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
      this.config.backend.validateCron(cronExpr);
    } catch (error) {
      throw new Error(
        `Invalid ${scheduleType} cron expression for ${entityType}: "${cronExpr}" - ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
