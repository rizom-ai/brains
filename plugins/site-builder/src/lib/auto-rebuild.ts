import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { LeadingTrailingDebounce } from "@brains/utils";
import type { SiteBuilderConfig } from "../config";

/**
 * Manages debounced site rebuilds triggered by entity changes or explicit
 * build requests. Separate debounces per environment so preview and production
 * do not interfere with each other.
 */
export class RebuildManager {
  private debounces = new Map<string, LeadingTrailingDebounce>();
  private unsubscribeFunctions: Array<() => void> = [];

  constructor(
    private readonly config: SiteBuilderConfig,
    private readonly context: ServicePluginContext,
    private readonly pluginId: string,
    private readonly logger: Logger,
  ) {}

  /**
   * Request a site rebuild through the shared debounce.
   * Both auto-rebuild (entity events) and the build-site tool use this.
   */
  requestBuild(environment?: "preview" | "production"): void {
    const env =
      environment ?? (this.config.previewOutputDir ? "preview" : "production");

    let debounce = this.debounces.get(env);
    if (!debounce) {
      debounce = new LeadingTrailingDebounce(() => {
        void this.enqueueBuild(env);
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
    const excludedTypes = new Set(["base"]);

    const entityEventHandler = async (message: {
      payload: { entityType: string };
    }): Promise<{ success: boolean }> => {
      const { entityType } = message.payload;
      if (!excludedTypes.has(entityType)) {
        this.logger.debug(`Entity type ${entityType} will trigger rebuild`);
        this.requestBuild();
      }
      return { success: true };
    };

    const events = ["entity:created", "entity:updated", "entity:deleted"];
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
  dispose(): void {
    for (const debounce of this.debounces.values()) {
      debounce.dispose();
    }
    this.debounces.clear();

    for (const unsubscribe of this.unsubscribeFunctions) {
      unsubscribe();
    }
    this.unsubscribeFunctions = [];
  }

  private async enqueueBuild(
    environment: "preview" | "production",
  ): Promise<void> {
    const outputDir =
      environment === "production"
        ? this.config.productionOutputDir
        : (this.config.previewOutputDir ?? this.config.productionOutputDir);

    this.logger.debug(`Triggering ${environment} site rebuild`);

    try {
      await this.context.jobs.enqueue(
        "site-build",
        {
          environment,
          outputDir,
          workingDir: this.config.workingDir,
          enableContentGeneration: true,
          metadata: {
            trigger: "debounced-rebuild",
            timestamp: new Date().toISOString(),
          },
        },
        null,
        {
          priority: 0,
          source: this.pluginId,
          metadata: {
            operationType: "content_operations" as const,
          },
          deduplication: "skip",
        },
      );
      this.logger.debug("Site rebuild enqueued");
    } catch (error) {
      this.logger.error("Failed to enqueue site rebuild", { error });
    }
  }
}
