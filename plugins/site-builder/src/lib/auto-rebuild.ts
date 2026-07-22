import { ENTITY_CHANNELS } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { LeadingTrailingDebounce } from "@brains/utils/debounce";
import type { SiteBuilderConfig } from "../config";
import type { SiteBuildStatusService } from "./site-build-status";

interface EntityChangeMessage {
  payload: { entityType: string };
}

interface AutoRebuildContext {
  messaging: {
    subscribe(
      type: string,
      handler: (
        message: EntityChangeMessage,
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
      };
    }): Promise<string>;
  };
}

/**
 * Manages debounced site rebuilds triggered by entity changes or explicit
 * build requests. Separate debounces per environment so preview and production
 * do not interfere with each other.
 */
export class RebuildManager {
  private readonly config: SiteBuilderConfig;
  private readonly context: AutoRebuildContext;
  private readonly pluginId: string;
  private readonly logger: Logger;
  private readonly statusService: SiteBuildStatusService | undefined;
  private debounces = new Map<string, LeadingTrailingDebounce>();
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

  /**
   * Subscribe to entity CRUD events so content changes automatically trigger
   * a site rebuild.
   */
  setupAutoRebuild(): void {
    if (this.disposed) return;
    const excludedTypes = new Set(["note"]);

    const entityEventHandler = async (
      message: EntityChangeMessage,
    ): Promise<{ success: boolean }> => {
      const { entityType } = message.payload;
      if (!excludedTypes.has(entityType)) {
        this.logger.debug(`Entity type ${entityType} will trigger rebuild`);
        this.requestBuild();
      }
      return { success: true };
    };

    const events = [
      ENTITY_CHANNELS.created,
      ENTITY_CHANNELS.updated,
      ENTITY_CHANNELS.deleted,
    ];
    for (const event of events) {
      this.unsubscribeFunctions.push(
        this.context.messaging.subscribe(event, entityEventHandler),
      );
    }

    this.logger.debug(
      `Auto-rebuild enabled (${this.config.rebuildDebounce}ms debounce), excluding types: ${[...excludedTypes].join(", ")}`,
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
    environment: "preview" | "production",
  ): Promise<void> {
    const outputDir =
      environment === "production"
        ? this.config.productionOutputDir
        : this.config.previewOutputDir;

    this.logger.debug(`Triggering ${environment} site rebuild`);

    try {
      const jobId = await this.context.jobs.enqueue({
        type: "site-build",
        data: {
          environment,
          outputDir,
          workingDir: this.config.workingDir,
          enableContentGeneration: true,
          metadata: {
            trigger: "debounced-rebuild",
            timestamp: new Date().toISOString(),
          },
        },
        options: {
          priority: 0,
          source: this.pluginId,
          metadata: {
            operationType: "content_operations",
          },
          deduplication: "skip",
        },
      });
      await this.statusService?.markQueued(environment, jobId);
      this.logger.debug("Site rebuild enqueued");
    } catch (error) {
      await this.statusService?.clearActive(environment);
      this.logger.error("Failed to enqueue site rebuild", { error });
    }
  }
}
