import type { ProjectionWaveReady } from "@brains/contracts";
import type { LoggerContract } from "@brains/sdk/services";
import { LeadingTrailingDebounce } from "@brains/utils/debounce";
import type { SiteBuilderConfig } from "../config";
import { siteBuildJob } from "./site-build-job";
import type { SiteBuildStatusService } from "./site-build-status";

/** Queueing this package's own builds, which is all a rebuild needs. */
export interface RebuildJobs {
  enqueue(
    definition: typeof siteBuildJob,
    input: {
      environment: "preview" | "production";
      outputDir: string;
      workingDir?: string | undefined;
      enableContentGeneration: boolean;
      metadata: { trigger: string; timestamp: string };
      inputGeneration: number;
    },
  ): Promise<{ id: string }>;
}

/**
 * Types whose changes alone do not justify a render: notes are working
 * material and never appear on the site.
 */
const EXCLUDED_REBUILD_TYPES = new Set(["note"]);

/**
 * Manages debounced site rebuilds triggered by entity changes or explicit
 * build requests. Separate debounces per environment so preview and production
 * do not interfere with each other.
 */
export class RebuildManager {
  private readonly config: SiteBuilderConfig;
  private readonly jobs: RebuildJobs;
  private readonly logger: LoggerContract;
  private readonly statusService: SiteBuildStatusService | undefined;
  private debounces = new Map<string, LeadingTrailingDebounce>();
  private readonly dirtyGenerations = new Map<string, number>();
  private readonly queuedGenerations = new Map<
    string,
    { jobId: string; generation: number }
  >();
  private readonly activeBuilds = new Map<
    string,
    { jobId: string; generation: number }
  >();
  private readonly activeTasks = new Set<Promise<void>>();
  private disposePromise: Promise<void> | null = null;
  private disposed = false;

  constructor(
    config: SiteBuilderConfig,
    jobs: RebuildJobs,
    logger: LoggerContract,
    statusService?: SiteBuildStatusService,
  ) {
    this.config = config;
    this.jobs = jobs;
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
          this.enqueueBuild(env, false),
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

    this.dirtyGenerations.set(env, (this.dirtyGenerations.get(env) ?? 0) + 1);
    await this.statusService?.markRequested(env);
    await this.enqueueBuild(env, true, true);
  }

  markBuildStarted(
    environment: "preview" | "production",
    jobId: string,
    inputGeneration: number,
  ): void {
    if (this.disposed) return;
    this.activeBuilds.set(environment, {
      jobId,
      generation: inputGeneration,
    });
    if (this.queuedGenerations.get(environment)?.jobId === jobId) {
      this.queuedGenerations.delete(environment);
    }
  }

  async markBuildFinished(
    environment: "preview" | "production",
    jobId: string,
    inputGeneration: number,
  ): Promise<void> {
    const active = this.activeBuilds.get(environment);
    if (active?.jobId !== jobId || active.generation !== inputGeneration) {
      return;
    }
    this.activeBuilds.delete(environment);
    if (
      !this.disposed &&
      (this.dirtyGenerations.get(environment) ?? 0) > inputGeneration
    ) {
      await this.enqueueBuild(environment, true);
    }
  }

  /**
   * A finished projection wave, which is when the brain's records have
   * settled enough to be worth rendering. Intermediate writes are not: a
   * rebuild per edit renders the same site over and over.
   */
  async onProjectionWave(summary: ProjectionWaveReady): Promise<void> {
    if (this.disposed || !this.config.autoRebuild) return;
    const changedTypes = [
      ...summary.sourceTypes,
      ...summary.changedTargetTypes,
    ];
    if (changedTypes.every((type) => EXCLUDED_REBUILD_TYPES.has(type))) return;
    this.logger.debug(`Projection wave ${summary.waveId} will trigger rebuild`);
    await this.requestAutomaticBuild();
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
    this.queuedGenerations.clear();
    this.activeBuilds.clear();

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
    environment: "preview" | "production",
    automatic: boolean,
    failClosed: boolean = false,
  ): Promise<void> {
    if (automatic && this.activeBuilds.has(environment)) return;
    const inputGeneration = this.dirtyGenerations.get(environment) ?? 0;
    const queued = this.queuedGenerations.get(environment);
    if (automatic && queued) return;

    const outputDir =
      environment === "production"
        ? this.config.productionOutputDir
        : this.config.previewOutputDir;

    this.logger.debug(`Triggering ${environment} site rebuild`);

    try {
      const job = await this.jobs.enqueue(siteBuildJob, {
        environment,
        outputDir,
        workingDir: this.config.workingDir,
        enableContentGeneration: true,
        metadata: {
          trigger: "debounced-rebuild",
          timestamp: new Date().toISOString(),
        },
        inputGeneration,
      });
      if (automatic) {
        this.queuedGenerations.set(environment, {
          jobId: job.id,
          generation: inputGeneration,
        });
      }
      await this.statusService?.markQueued(environment, job.id);
      this.logger.debug("Site rebuild enqueued");
    } catch (error) {
      await this.statusService?.clearActive(environment);
      this.logger.error("Failed to enqueue site rebuild", { error });
      if (failClosed) throw error;
    }
  }
}
