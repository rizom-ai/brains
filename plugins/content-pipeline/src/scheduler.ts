import { getErrorMessage } from "@brains/utils";
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
import type { GenerationCondition } from "./types/config";
import { sendPublishCompleted, sendPublishFailed } from "./scheduler-publish";
import type { PublishDeps } from "./scheduler-publish";
import {
  sendGenerationCompleted,
  sendGenerationFailed,
} from "./scheduler-generation";
import type { GenerationDeps } from "./scheduler-generation";
import type { SchedulerConfig } from "./types/scheduler";
import { PublishScheduleRunner } from "./scheduler-publish-runner";
import { GenerationScheduleRunner } from "./scheduler-generation-runner";

// Re-export all types from types/scheduler for backward compatibility
export type {
  SchedulerConfig,
  PublishExecuteEvent,
  GenerateExecuteEvent,
  GenerationConditionResult,
  PublishSuccessEvent,
  PublishFailedEvent,
} from "./types/scheduler";

export class ContentScheduler {
  private static instance: ContentScheduler | null = null;

  private config: SchedulerConfig;
  private publishRunner: PublishScheduleRunner;
  private generationRunner: GenerationScheduleRunner;
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

    this.publishRunner = new PublishScheduleRunner({
      config: this.config,
      getPublishDeps: (): PublishDeps => this.publishDeps,
      isRunning: (): boolean => this.running,
    });
    this.generationRunner = new GenerationScheduleRunner({
      config: this.config,
      getGenerationDeps: (): GenerationDeps => this.generationDeps,
      isRunning: (): boolean => this.running,
    });
  }

  // -------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------

  public async start(): Promise<void> {
    if (this.running) return;

    this.running = true;

    this.publishRunner.start();
    this.generationRunner.start();
  }

  public async stop(): Promise<void> {
    this.running = false;

    this.publishRunner.stop();
    this.generationRunner.stop();
  }

  public isRunning(): boolean {
    return this.running;
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
        GenerationCondition
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
        `Invalid ${scheduleType} cron expression for ${entityType}: "${cronExpr}" - ${getErrorMessage(error)}`,
      );
    }
  }
}
