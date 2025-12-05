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
   * Generic job tracking Map - interface-specific tracking info
   * Each interface type can define its own TTrackingInfo structure
   */
  protected jobMessages = new Map<string, TTrackingInfo>();

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

    context.registerDaemon(this.id, this.daemon);
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
   * Abstract method for handling progress events
   * Interface implementations must define their specific progress handling
   */
  protected abstract handleProgressEvent(
    event: JobProgressEvent,
    context: JobContext,
  ): Promise<void>;

  /**
   * Generic rootJobId inheritance logic for all interface types
   * Checks both direct job ownership and inherited ownership via rootJobId
   */
  protected ownsJob(jobId: string, rootJobId?: string): boolean {
    // Check direct ownership
    if (this.jobMessages.has(jobId)) {
      return true;
    }

    // Check inherited ownership via rootJobId
    if (rootJobId && this.jobMessages.has(rootJobId)) {
      return true;
    }

    return false;
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
    const directTracking = this.jobMessages.get(jobId);
    if (directTracking) {
      return directTracking;
    }

    // Try inherited tracking via rootJobId
    if (rootJobId) {
      const inheritedTracking = this.jobMessages.get(rootJobId);
      if (inheritedTracking) {
        return inheritedTracking;
      }
    }

    return undefined;
  }

  /**
   * Store job tracking information
   */
  protected setJobTracking(jobId: string, trackingInfo: TTrackingInfo): void {
    this.jobMessages.set(jobId, trackingInfo);
  }

  /**
   * Remove job tracking information
   */
  protected removeJobTracking(jobId: string): void {
    this.jobMessages.delete(jobId);
  }

  /**
   * Create a job with automatic tracking - interface plugins should use this
   * instead of calling context.enqueueJob directly
   */
  protected async createJobWithTracking(
    type: string,
    data: unknown,
    trackingInfo: TTrackingInfo,
    options?: JobOptions,
  ): Promise<string> {
    const context = this.getContext();
    const jobId = await context.enqueueJob(type, data, options);
    this.setJobTracking(jobId, trackingInfo);
    return jobId;
  }

  /**
   * Create a batch with automatic tracking - interface plugins should use this
   * instead of calling context.enqueueBatch directly
   */
  protected async createBatchWithTracking(
    operations: BatchOperation[],
    trackingInfo: TTrackingInfo,
    options?: JobOptions,
  ): Promise<string> {
    const context = this.getContext();
    const batchId = await context.enqueueBatch(operations, options);
    this.setJobTracking(batchId, trackingInfo);
    return batchId;
  }
}
