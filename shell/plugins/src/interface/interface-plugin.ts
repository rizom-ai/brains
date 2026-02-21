import { BasePlugin } from "../base-plugin";
import type {
  PluginCapabilities,
  IShell,
  BaseJobTrackingInfo,
} from "../interfaces";
import type { Daemon } from "@brains/daemon-registry";
import type { InterfacePluginContext } from "./context";
import { createInterfacePluginContext } from "./context";
import type {
  JobProgressEvent,
  JobContext,
  BatchOperation,
  JobOptions,
} from "@brains/job-queue";

/**
 * Default TTL for job tracking entries (1 hour in milliseconds)
 * Jobs older than this will be cleaned up automatically
 */
const DEFAULT_JOB_TRACKING_TTL_MS = 60 * 60 * 1000;

/**
 * Internal tracking entry with timestamp for TTL-based cleanup
 */
interface TrackingEntry<T> {
  info: T;
  createdAt: number;
}

/**
 * Base class for interface plugins
 * Interface plugins provide user interaction capabilities and manage daemons
 * Provides generic job tracking and rootJobId inheritance for progress routing
 */
export abstract class InterfacePlugin<
  TConfig = unknown,
  TTrackingInfo extends BaseJobTrackingInfo = BaseJobTrackingInfo,
> extends BasePlugin<TConfig, InterfacePluginContext> {
  public readonly type = "interface" as const;

  /**
   * Daemon instance for long-running processes
   */
  protected daemon?: Daemon;

  /**
   * Internal job tracking with timestamps for TTL-based cleanup
   */
  private jobTrackingEntries = new Map<string, TrackingEntry<TTrackingInfo>>();

  /**
   * TTL for job tracking entries in milliseconds (default: 1 hour)
   * Override in subclasses if different TTL is needed
   */
  protected jobTrackingTtlMs = DEFAULT_JOB_TRACKING_TTL_MS;

  /**
   * Legacy accessor for backward compatibility
   * Returns a view of current tracking info (without timestamps)
   */
  protected get jobMessages(): Map<string, TTrackingInfo> {
    const result = new Map<string, TTrackingInfo>();
    for (const [key, entry] of this.jobTrackingEntries) {
      result.set(key, entry.info);
    }
    return result;
  }

  /**
   * Register the plugin with shell - creates InterfacePluginContext internally
   */
  override async register(shell: IShell): Promise<PluginCapabilities> {
    // Create typed context from shell
    const context = createInterfacePluginContext(shell, this.id);
    this.context = context;

    // Initialize daemon before registration
    this.initializeDaemon();

    // Register daemon if provided
    if (this.daemon) {
      await this.registerDaemon(context);
    }

    // Call lifecycle hook with typed context
    await this.onRegister(context);

    return {
      tools: await this.getTools(),
      resources: await this.getResources(),
    };
  }

  /**
   * Lifecycle hook for plugin initialization
   * Override this to perform plugin-specific setup
   */
  protected override async onRegister(
    _context: InterfacePluginContext,
  ): Promise<void> {
    // Default implementation does nothing
  }

  /**
   * Register daemon with the daemon registry
   */
  protected async registerDaemon(
    context: InterfacePluginContext,
  ): Promise<void> {
    if (!this.daemon) return;

    context.daemons.register(this.id, this.daemon);
    context.logger.debug(`Registered daemon for interface: ${this.id}`);
  }

  /**
   * Override to provide daemon implementation
   */
  protected createDaemon(): Daemon | undefined {
    return undefined;
  }

  /**
   * Initialize daemon during plugin construction
   */
  protected initializeDaemon(): void {
    const daemon = this.createDaemon();
    if (daemon) {
      this.daemon = daemon;
    }
  }

  /**
   * Handle progress events for jobs owned by this interface
   * Override this to provide custom progress handling (e.g., sending updates to users)
   * Default implementation is a no-op
   */
  protected async handleProgressEvent(
    _event: JobProgressEvent,
    _context: JobContext,
  ): Promise<void> {
    // Default no-op - override in subclasses that need progress handling
  }

  /**
   * Clean up expired job tracking entries based on TTL
   * Called automatically when new entries are added
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.jobTrackingEntries) {
      if (now - entry.createdAt > this.jobTrackingTtlMs) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.jobTrackingEntries.delete(key);
    }
  }

  /**
   * Generic rootJobId inheritance logic for all interface types
   * Checks both direct job ownership and inherited ownership via rootJobId
   */
  protected ownsJob(jobId: string, rootJobId?: string): boolean {
    return (
      this.jobTrackingEntries.has(jobId) ||
      (rootJobId !== undefined && this.jobTrackingEntries.has(rootJobId))
    );
  }

  /**
   * Get tracking info for a job (direct or inherited)
   * Returns the tracking info from either the job itself or its root job
   */
  protected getJobTracking(
    jobId: string,
    rootJobId?: string,
  ): TTrackingInfo | undefined {
    // Try direct tracking first
    const directEntry = this.jobTrackingEntries.get(jobId);
    if (directEntry) {
      return directEntry.info;
    }

    // Try inherited tracking via rootJobId
    if (rootJobId) {
      const inheritedEntry = this.jobTrackingEntries.get(rootJobId);
      if (inheritedEntry) {
        return inheritedEntry.info;
      }
    }

    return undefined;
  }

  /**
   * Store job tracking information with automatic TTL-based cleanup
   */
  protected setJobTracking(jobId: string, trackingInfo: TTrackingInfo): void {
    // Clean up expired entries before adding new one
    this.cleanupExpiredEntries();

    this.jobTrackingEntries.set(jobId, {
      info: trackingInfo,
      createdAt: Date.now(),
    });
  }

  /**
   * Remove job tracking information
   */
  protected removeJobTracking(jobId: string): void {
    this.jobTrackingEntries.delete(jobId);
  }

  /**
   * Create a job with automatic tracking - interface plugins should use this
   * instead of calling context.jobs.enqueue directly
   */
  protected async createJobWithTracking(
    type: string,
    data: unknown,
    trackingInfo: TTrackingInfo,
    options?: JobOptions,
  ): Promise<string> {
    const context = this.getContext();
    // Interface-initiated jobs don't have ToolContext - pass null
    const jobId = await context.jobs.enqueue(type, data, null, options);
    this.setJobTracking(jobId, trackingInfo);
    return jobId;
  }

  /**
   * Create a batch with automatic tracking - interface plugins should use this
   * instead of calling context.jobs.enqueueBatch directly
   */
  protected async createBatchWithTracking(
    operations: BatchOperation[],
    trackingInfo: TTrackingInfo,
    options?: JobOptions,
  ): Promise<string> {
    const context = this.getContext();
    const batchId = await context.jobs.enqueueBatch(operations, options);
    this.setJobTracking(batchId, trackingInfo);
    return batchId;
  }
}
