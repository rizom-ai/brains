import type { BusContract, PublishResult } from "@brains/contracts";
import type { z } from "@brains/utils/zod";
import type { Logger } from "@brains/utils/logger";
import type { QueueManager } from "../queue-manager";
import type { ProviderRegistry } from "../provider-registry";
import type { RetryTracker } from "../retry-tracker";
import type { GenerationCondition } from "./config";
import type { SchedulerBackend } from "@brains/scheduler";
import type { PublishEntityExecutor } from "../publish-executor";

/**
 * The publish side of the message bus, which is all the scheduler uses.
 *
 * Non-generic on purpose: the messaging namespace is assignable to this, and a
 * test can supply a plain function without the type parameters bun's mock()
 * erases. `send` carries the scheduler's publish events only, so every send is
 * a broadcast and none reads its response.
 */
export interface SchedulerMessagePublisher {
  send(request: {
    type: string;
    payload: unknown;
    sender?: string;
    broadcast: true;
  }): Promise<unknown>;
  /** A command every owner hears, as `IMessagingNamespace.command`. */
  command<TRequest extends z.ZodType>(
    contract: BusContract<TRequest, z.ZodType, "command">,
    payload: z.input<TRequest>,
  ): Promise<void>;
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
   * Use BunSchedulerBackend for production, TestSchedulerBackend for tests.
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
  messageBus?: SchedulerMessagePublisher;
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

/**
 * A SchedulerConfig after ContentScheduler's constructor has defaulted the
 * optional schedule maps to `{}`. Runners take this rather than SchedulerConfig
 * so the defaulting is proven by the type instead of asserted at each read.
 */
export type ResolvedSchedulerConfig = SchedulerConfig & {
  entitySchedules: Record<string, string>;
  generationSchedules: Record<string, string>;
  generationConditions: Record<string, GenerationCondition>;
};
