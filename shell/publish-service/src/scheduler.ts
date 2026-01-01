/**
 * PublishScheduler - Single daemon that processes all publish queues
 *
 * Implements Component Interface Standardization pattern.
 * Runs on an interval, processing the oldest queued entity across all types.
 */

import type { QueueManager, QueueEntry } from "./queue-manager";
import type { ProviderRegistry } from "./provider-registry";
import type { RetryTracker } from "./retry-tracker";
import type { PublishResult } from "./types/provider";

export interface SchedulerConfig {
  queueManager: QueueManager;
  providerRegistry: ProviderRegistry;
  retryTracker: RetryTracker;
  tickIntervalMs?: number;
  onPublish?: (event: PublishSuccessEvent) => void;
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

const DEFAULT_TICK_INTERVAL = 60000; // 1 minute

export class PublishScheduler {
  private static instance: PublishScheduler | null = null;

  private queueManager: QueueManager;
  private providerRegistry: ProviderRegistry;
  private retryTracker: RetryTracker;
  private tickIntervalMs: number;
  private onPublish: ((event: PublishSuccessEvent) => void) | undefined;
  private onFailed: ((event: PublishFailedEvent) => void) | undefined;

  private running = false;
  private tickTimeout: ReturnType<typeof setTimeout> | null = null;

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
    this.tickIntervalMs = config.tickIntervalMs ?? DEFAULT_TICK_INTERVAL;
    this.onPublish = config.onPublish;
    this.onFailed = config.onFailed;
  }

  /**
   * Start the scheduler
   */
  public async start(): Promise<void> {
    if (this.running) return;

    this.running = true;
    this.scheduleNextTick();
  }

  /**
   * Stop the scheduler
   */
  public async stop(): Promise<void> {
    this.running = false;
    if (this.tickTimeout) {
      clearTimeout(this.tickTimeout);
      this.tickTimeout = null;
    }
  }

  /**
   * Check if scheduler is running
   */
  public isRunning(): boolean {
    return this.running;
  }

  /**
   * Process the next tick - check queue and publish
   */
  private async tick(): Promise<void> {
    if (!this.running) return;

    try {
      const next = await this.queueManager.getNextAcrossTypes();
      if (next) {
        await this.processEntry(next);
      }
    } catch (error) {
      // Log error but continue running
      console.error("Scheduler tick error:", error);
    }

    this.scheduleNextTick();
  }

  /**
   * Schedule the next tick
   */
  private scheduleNextTick(): void {
    if (!this.running) return;

    this.tickTimeout = setTimeout(() => {
      void this.tick();
    }, this.tickIntervalMs);
  }

  /**
   * Process a queue entry - publish and handle result
   */
  private async processEntry(entry: QueueEntry): Promise<void> {
    const provider = this.providerRegistry.get(entry.entityType);

    try {
      // TODO: In the full implementation, we need to fetch entity content
      // For now, pass empty content - plugins will need to provide content
      const result = await provider.publish("", {});

      // Remove from queue on success
      await this.queueManager.remove(entry.entityType, entry.entityId);

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

      // Remove from queue (will be re-queued if retrying)
      await this.queueManager.remove(entry.entityType, entry.entityId);

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
