import type {
  Plugin,
  EntityPluginContext,
  DeriveEvent,
  DataSource,
  Template,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import type { BaseEntity } from "@brains/entity-service";
import { seriesSchema, type Series } from "./schemas/series";
import { seriesAdapter } from "./adapters/series-adapter";
import { SeriesManager } from "./services/series-manager";
import type { JobHandler } from "@brains/job-queue";
import { SeriesDataSource } from "./datasources/series-datasource";
import { SeriesGenerationHandler } from "./handlers/seriesGenerationHandler";
import { getTemplates } from "./lib/register-templates";
import { seriesDescriptionTemplate } from "./templates/description-template";
import packageJson from "../package.json";

/**
 * Series EntityPlugin — auto-derives series from entities with seriesName metadata.
 *
 * Cross-content: watches entity events across ALL types, not just blog posts.
 * Uses derive() for event-driven creation and manual batch extraction.
 */
export class SeriesPlugin extends EntityPlugin<Series> {
  readonly entityType = "series";
  readonly schema = seriesSchema;
  readonly adapter = seriesAdapter;
  private manager?: SeriesManager;

  constructor() {
    super("series", packageJson);
  }

  protected override getEntityTypeConfig() {
    return { weight: 0.5 };
  }

  protected override createGenerationHandler(
    context: EntityPluginContext,
  ): JobHandler {
    return new SeriesGenerationHandler(
      this.logger.child("SeriesGenerationHandler"),
      context,
    );
  }

  protected override getTemplates(): Record<string, Template> {
    return {
      ...getTemplates(),
      description: seriesDescriptionTemplate,
    };
  }

  protected override getDataSources(): DataSource[] {
    return [new SeriesDataSource(this.logger.child("SeriesDataSource"))];
  }

  /**
   * Subscribe to entity events to auto-derive series.
   */
  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    this.manager = new SeriesManager(
      context.entityService,
      this.logger.child("SeriesManager"),
    );
    const manager = this.manager;

    // Watch entity create/update for any type with seriesName
    for (const event of ["entity:created", "entity:updated"] as const) {
      context.messaging.subscribe(event, async (message) => {
        try {
          const payload = message.payload as {
            entityType: string;
            entity?: BaseEntity;
          };
          if (payload.entityType === "series") return { success: true };
          if (payload.entity) {
            const seriesName = manager.getSeriesName(payload.entity);
            if (seriesName) {
              await manager.handleEntityChange(payload.entity);
            }
          }
          return { success: true };
        } catch (error) {
          this.logger.error("Failed to handle entity event for series", {
            error,
          });
          return { success: false, error: "Series derivation failed" };
        }
      });
    }

    // Watch entity deletion to clean up orphaned series
    context.messaging.subscribe("entity:deleted", async (message) => {
      try {
        const payload = message.payload as { entityType: string };
        if (payload.entityType === "series") return { success: true };
        await manager.handleEntityDeleted();
        return { success: true };
      } catch (error) {
        this.logger.error("Failed to handle entity deletion for series", {
          error,
        });
        return { success: false, error: "Series cleanup failed" };
      }
    });

    // Full resync after initial directory sync
    context.messaging.subscribe("sync:initial:completed", async () => {
      try {
        this.logger.info("Initial sync completed, syncing series");
        await manager.syncAllSeries();
        return { success: true };
      } catch (error) {
        this.logger.error("Failed to sync series after initial sync", {
          error,
        });
        return { success: false, error: "Series sync failed" };
      }
    });
  }

  /**
   * Derive series from a source entity.
   * Called by event subscriptions and by system_extract for single-source extraction.
   */
  private requireManager(): SeriesManager {
    if (!this.manager) throw new Error("SeriesPlugin not registered");
    return this.manager;
  }

  public override async derive(
    source: BaseEntity,
    _event: DeriveEvent,
    _context: EntityPluginContext,
  ): Promise<void> {
    await this.requireManager().handleEntityChange(source);
  }

  public override async deriveAll(context: EntityPluginContext): Promise<void> {
    await this.requireManager().syncAllSeries();

    // Enrich series that lack a description
    const handler = new SeriesGenerationHandler(
      this.logger.child("SeriesGenerationHandler"),
      context,
    );
    const allSeries = await context.entityService.listEntities<Series>(
      "series",
      { limit: 1000 },
    );
    for (const series of allSeries) {
      try {
        const body = this.adapter.parseBody(series.content);
        if (!body.description) {
          this.logger.info(
            `Generating description for series: ${series.metadata.title}`,
          );
          await handler.process({ seriesId: series.id });
        }
      } catch (error) {
        this.logger.error(
          `Failed to generate description for series: ${series.id}`,
          { error },
        );
      }
    }
  }
}

export function seriesPlugin(): Plugin {
  return new SeriesPlugin();
}
