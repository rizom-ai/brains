import type { IMessageBus, ICoreEntityService } from "@brains/plugins";
import type { PublishResult } from "@brains/utils";
import type { Logger } from "@brains/utils";
import type { QueueManager } from "../queue-manager";
import type { ProviderRegistry } from "../provider-registry";
import type { RetryTracker } from "../retry-tracker";
import type { GenerationCondition } from "./config";
import type { SchedulerBackend } from "../scheduler-backend";

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
