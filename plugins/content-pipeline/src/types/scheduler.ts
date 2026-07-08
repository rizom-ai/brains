import type { IMessageBus } from "@brains/plugins";
import type { PublishResult } from "@brains/contracts";
import type { Logger } from "@brains/utils/logger";
import type { QueueManager } from "../queue-manager";
import type { ProviderRegistry } from "../provider-registry";
import type { RetryTracker } from "../retry-tracker";
import type { GenerationCondition } from "./config";
import type { SchedulerBackend } from "../scheduler-backend";
import type { PublishEntityExecutor } from "../publish-executor";

export interface GenerateExecuteEvent {
  entityType: string;
}

export interface GenerationConditionResult {
  shouldGenerate: boolean;
  reason?: string;
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

export interface SchedulerConfig {
  queueManager: QueueManager;
  providerRegistry: ProviderRegistry;
  retryTracker: RetryTracker;
  /** Logger for structured error reporting */
  logger: Logger;
  /**
   * Scheduler backend for cron/interval scheduling.
   * Use CronerBackend for production, TestSchedulerBackend for tests.
   */
  backend: SchedulerBackend;
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
  /** Optional message bus for publish/generation events */
  messageBus?: IMessageBus;
  /** Shared executor for provider publishing and durable publish state updates. */
  publishExecutor?: Pick<PublishEntityExecutor, "publish">;
  /** Callback on successful publish */
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
