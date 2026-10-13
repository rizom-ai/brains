import {
  PROJECTION_CHANNELS,
  ProjectionWaveReadySchema,
  type ProjectionWaveReady,
} from "@brains/contracts";
import type { Logger } from "@brains/utils/logger";
import { LeadingTrailingDebounce } from "@brains/utils/debounce";
import {
  DEFAULT_RETRY_MAX_DELAY_MS,
  retryWithBackoff,
} from "@brains/utils/retry-backoff";
import type { SiteBuilderConfig } from "../config";
import type { SiteBuildStatusService } from "./site-build-status";

interface ProjectionWaveReadyMessage {
  payload: ProjectionWaveReady;
}

type BuildEnvironment = "preview" | "production";

interface AutoRebuildContext {
  messaging: {
    subscribeExecution(
      type: string,
      handler: (
        message: ProjectionWaveReadyMessage,
      ) => Promise<{ success: boolean }> | { success: boolean },
    ): () => void;
  };
  jobs: {
    enqueue(request: {
      type: "site-build";
      data: {
        environment: "preview" | "production";
        outputDir: string;
        workingDir?: string | undefined;
        enableContentGeneration: boolean;
        metadata: {
          trigger: string;
          timestamp: string;
        };
      };
      options: {
        priority: number;
        source: string;
        metadata: { operationType: "content_operations" };
        deduplication: "skip";
        deduplicationKey: string;
      };
    }): Promise<string>;
  };
}

/**
 * The queue claims the lowest priority first. Embeddings and projections queue
 * at the default, 0, so a build goes ahead of them: a new brain's site is up
 * after its first import is stored, not once every entity is embedded and read.
 */
const SITE_BUILD_PRIORITY = -10;

/**
 * Manages debounced site rebuilds triggered by entity changes or explicit
 * build requests. Separate debounces per environment so preview and production
 * do not interfere with each other.
 *
 * Build state lives in the job queue, not here: the web process schedules
 * waves while the worker runs builds, so no one process sees both. The queue
 * skips a build only behind a pending one, which has yet to read its input;
 * a change during a running build leaves one pending behind it.
 *
 * The queue refuses an enqueue once another process has held its write lock
 * past the enqueue budget, and no budget bounds how long a stalled commit can
 * hold it. A requested build therefore stays requested: a refused enqueue is
 * retried until the queue admits it or the manager is disposed.
 */
export class RebuildManager {
  private readonly config: SiteBuilderConfig;
  private readonly context: AutoRebuildContext;
  private readonly pluginId: string;
  private readonly logger: Logger;
  private readonly statusService: SiteBuildStatusService | undefined;
  private debounces = new Map<string, LeadingTrailingDebounce>();
  private readonly enqueueRetries = new Map<
    BuildEnvironment,
    AbortController
  >();
  private unsubscribeFunctions: Array<() => void> = [];
  private readonly activeTasks = new Set<Promise<void>>();
  private disposePromise: Promise<void> | null = null;
  private disposed = false;

  constructor(
    config: SiteBuilderConfig,
    context: AutoRebuildContext,
    pluginId: string,
    logger: Logger,
    statusService?: SiteBuildStatusService,
  ) {
    this.config = config;
    this.context = context;
    this.pluginId = pluginId;
    this.logger = logger;
    this.statusService = statusService;
  }

  /**
   * Request a site rebuild through the shared debounce.
   * Both auto-rebuild (entity events) and the build-site tool use this.
   */
  requestBuild(environment?: "preview" | "production"): void {
    if (this.disposed) return;
    const env =
      environment ?? (this.config.previewOutputDir ? "preview" : "production");

    if (this.statusService) {
      this.runTrackedTask(
        "mark build requested",
        () => this.statusService?.markRequested(env) ?? Promise.resolve(),
      );
    }

    let debounce = this.debounces.get(env);
    if (!debounce) {
      debounce = new LeadingTrailingDebounce(() => {
        this.runTrackedTask(`enqueue ${env} build`, () =>
          this.enqueueBuild(env),
        );
      }, this.config.rebuildDebounce);
      this.debounces.set(env, debounce);
    }

    debounce.trigger();
  }

  private async requestAutomaticBuild(
    environment?: "preview" | "production",
  ): Promise<void> {
    if (this.disposed) return;
    const env =
      environment ?? (this.config.previewOutputDir ? "preview" : "production");

    await this.statusService?.markRequested(env);
    await this.enqueueBuild(env, true);
  }

  /** Subscribe to successful scheduler waves instead of intermediate CRUD. */
  setupAutoRebuild(): void {
    if (this.disposed) return;
    const excludedTypes = new Set(["note"]);

    const waveReadyHandler = async (
      message: ProjectionWaveReadyMessage,
    ): Promise<{ success: boolean }> => {
      const summary = ProjectionWaveReadySchema.parse(message.payload);
      const changedTypes = new Set([
        ...summary.sourceTypes,
        ...summary.changedTargetTypes,
      ]);
      if ([...changedTypes].some((type) => !excludedTypes.has(type))) {
        this.logger.debug(
          `Projection wave ${summary.waveId} will trigger rebuild`,
        );
        await this.requestAutomaticBuild();
      }
      return { success: true };
    };

    this.unsubscribeFunctions.push(
      this.context.messaging.subscribeExecution(
        PROJECTION_CHANNELS.waveReady,
        waveReadyHandler,
      ),
    );

    this.logger.debug(
      `Wave-end auto-rebuild enabled, excluding types: ${[...excludedTypes].join(", ")}`,
    );
  }

  /**
   * Cancel pending rebuilds and unsubscribe from all event subscriptions.
   */
  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    this.disposePromise = this.disposeOnce();
    return this.disposePromise;
  }

  private async disposeOnce(): Promise<void> {
    const cleanupErrors: unknown[] = [];
    for (const debounce of this.debounces.values()) {
      try {
        debounce.dispose();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    this.debounces.clear();
    for (const retry of this.enqueueRetries.values()) retry.abort();
    this.enqueueRetries.clear();

    for (const unsubscribe of this.unsubscribeFunctions) {
      try {
        unsubscribe();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    this.unsubscribeFunctions = [];

    await Promise.all([...this.activeTasks]);
    if (cleanupErrors.length > 0) throw cleanupErrors[0];
  }

  private runTrackedTask(
    description: string,
    operation: () => Promise<void>,
  ): void {
    const task = operation().catch((error: unknown) => {
      this.logger.error(`Failed to ${description}`, { error });
    });
    this.activeTasks.add(task);
    void task.then(() => {
      this.activeTasks.delete(task);
    });
  }

  private async enqueueBuild(
    environment: BuildEnvironment,
    failClosed: boolean = false,
  ): Promise<void> {
    this.logger.debug(`Triggering ${environment} site rebuild`);

    try {
      const jobId = await this.enqueueBuildJob(environment);
      this.cancelEnqueueRetry(environment);
      await this.statusService?.markQueued(environment, jobId);
      this.logger.debug("Site rebuild enqueued");
    } catch (error) {
      // An unacknowledged wave stays incomplete and the scheduler's sweep
      // advances it again, so a wave's build request fails closed instead.
      if (failClosed || this.disposed) {
        await this.statusService?.clearActive(environment);
        this.logger.error("Failed to enqueue site rebuild", { error });
        if (failClosed) throw error;
        return;
      }
      this.retryEnqueue(environment, error);
    }
  }

  private enqueueBuildJob(environment: BuildEnvironment): Promise<string> {
    return this.context.jobs.enqueue({
      type: "site-build",
      data: {
        environment,
        outputDir:
          environment === "production"
            ? this.config.productionOutputDir
            : this.config.previewOutputDir,
        workingDir: this.config.workingDir,
        enableContentGeneration: true,
        metadata: {
          trigger: "debounced-rebuild",
          timestamp: new Date().toISOString(),
        },
      },
      options: {
        priority: SITE_BUILD_PRIORITY,
        source: this.pluginId,
        metadata: {
          operationType: "content_operations",
        },
        deduplication: "skip",
        deduplicationKey: `site-build:${environment}`,
      },
    });
  }

  /** Keep the build requested and enqueue it again after a backoff. */
  private retryEnqueue(environment: BuildEnvironment, error: unknown): void {
    this.cancelEnqueueRetry(environment);
    const controller = new AbortController();
    this.enqueueRetries.set(environment, controller);
    this.runTrackedTask(`retry ${environment} build`, async () => {
      const outcome = await retryWithBackoff(
        () => this.enqueueBuildJob(environment),
        error,
        {
          firstDelayMs: this.config.rebuildDebounce,
          // First after one debounce window, then backing off to a minute.
          maxDelayMs: DEFAULT_RETRY_MAX_DELAY_MS,
          signal: controller.signal,
          onRetry: (refusal, delayMs) => {
            this.logger.warn(
              `Failed to enqueue ${environment} site rebuild; retrying in ${delayMs}ms`,
              { error: refusal },
            );
          },
        },
      );
      if (this.enqueueRetries.get(environment) === controller) {
        this.enqueueRetries.delete(environment);
      }
      if (outcome.kind === "succeeded") {
        await this.statusService?.markQueued(environment, outcome.value);
        this.logger.debug("Site rebuild enqueued");
      }
    });
  }

  /** A newer enqueue, a newer retry, or disposal supersedes a pending retry. */
  private cancelEnqueueRetry(environment: BuildEnvironment): void {
    this.enqueueRetries.get(environment)?.abort();
    this.enqueueRetries.delete(environment);
  }
}
