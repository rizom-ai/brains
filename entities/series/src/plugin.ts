import type {
  Plugin,
  EntityPluginContext,
  EntityTypeConfig,
  JobHandler,
  DataSource,
  Template,
  BaseEntity,
  DerivedEntityProjection,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { seriesSchema, type Series } from "./schemas/series";
import { seriesAdapter } from "./adapters/series-adapter";
import { SeriesManager } from "./services/series-manager";
import { SeriesDataSource } from "./datasources/series-datasource";
import { SeriesGenerationHandler } from "./handlers/seriesGenerationHandler";
import { getTemplates } from "./lib/register-templates";
import { seriesDescriptionTemplate } from "./templates/description-template";
import packageJson from "../package.json";

const seriesProjectionJobDataSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("derive"),
    reason: z.string().optional(),
  }),
  z.object({
    mode: z.literal("source"),
    entityId: z.string(),
    entityType: z.string(),
    seriesName: z.string(),
  }),
]);

type SeriesProjectionJobData = z.infer<typeof seriesProjectionJobDataSchema>;

interface SeriesSourceMetadata extends Record<string, unknown> {
  seriesName: string;
}

type SeriesSourceEntity = BaseEntity<SeriesSourceMetadata>;

/**
 * Series EntityPlugin — auto-derives series from entities with seriesName metadata.
 *
 * Cross-content: watches entity events across ALL types, not just blog posts.
 * Uses explicit projection jobs for event-driven and batch synchronization.
 */
export class SeriesPlugin extends EntityPlugin<Series> {
  readonly entityType = "series";
  readonly schema = seriesSchema;
  readonly adapter = seriesAdapter;
  private manager?: SeriesManager;

  constructor() {
    super("series", packageJson);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
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

  protected override getDerivedEntityProjections(
    context: EntityPluginContext,
  ): DerivedEntityProjection[] {
    return [
      {
        id: "series-projection",
        targetType: "series",
        job: {
          type: "series:project",
          handler: this.createSeriesProjectionHandler(context),
        },
        initialSync: {
          jobData: { mode: "derive", reason: "initial-sync" },
          jobOptions: this.getSyncProjectionJobOptions("initial-sync"),
        },
        sourceChange: {
          // Stays "*" because seriesName is opt-in metadata that any entity
          // type can carry — we filter per-event below by inspecting the
          // entity itself rather than its type.
          sourceTypes: ["*"],
          events: ["entity:created", "entity:updated", "entity:deleted"],
          requireInitialSync: true,
          jobData: (payload): SeriesProjectionJobData | null => {
            if (payload.entityType === "series") return null;
            // Both create/update and (since entity-mutations.deleteEntity now
            // attaches the prior entity) delete events carry payload.entity.
            // No seriesName → not relevant to this projection, skip.
            if (!payload.entity || !this.hasSeriesName(payload.entity)) {
              return null;
            }
            const seriesName = payload.entity.metadata.seriesName;
            return {
              mode: "source",
              entityId: payload.entity.id,
              entityType: payload.entity.entityType,
              seriesName,
            };
          },
          jobOptions: (
            payload,
          ):
            | ReturnType<SeriesPlugin["getSourceProjectionJobOptions"]>
            | undefined => {
            if (!payload.entity || !this.hasSeriesName(payload.entity)) {
              return undefined;
            }
            return this.getSourceProjectionJobOptions(payload.entity);
          },
        },
      },
    ];
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    this.manager = new SeriesManager(
      context.entityService,
      this.logger.child("SeriesManager"),
    );
  }

  private createSeriesProjectionHandler(
    context: EntityPluginContext,
  ): JobHandler<string, unknown> {
    return {
      process: async (data): Promise<{ success: true }> => {
        const parsed = seriesProjectionJobDataSchema.parse(data);
        if (parsed.mode === "derive") {
          await this.projectAll(context);
          return { success: true };
        }

        const source = await context.entityService.getEntity(
          parsed.entityType,
          parsed.entityId,
        );
        if (source) {
          await this.projectSource(source);
        } else {
          // Source no longer exists — this was a delete event. Targeted
          // cleanup of just this series is much cheaper than a full resync.
          await this.requireManager().cleanupOrphanedSeries(parsed.seriesName);
        }
        return { success: true };
      },
      validateAndParse: (data: unknown): SeriesProjectionJobData | null => {
        const result = seriesProjectionJobDataSchema.safeParse(data ?? {});
        return result.success ? result.data : null;
      },
    };
  }

  private requireManager(): SeriesManager {
    if (!this.manager) throw new Error("SeriesPlugin not registered");
    return this.manager;
  }

  private hasSeriesName(entity: BaseEntity): entity is SeriesSourceEntity {
    return typeof entity.metadata["seriesName"] === "string";
  }

  private getSyncProjectionJobOptions(reason: string): {
    source: string;
    deduplication: "coalesce";
    deduplicationKey: string;
    metadata: {
      operationType: "data_processing";
      operationTarget: string;
    };
  } {
    return {
      source: this.id,
      deduplication: "coalesce",
      deduplicationKey: `series-sync:${reason}`,
      metadata: {
        operationType: "data_processing",
        operationTarget: "series",
      },
    };
  }

  private getSourceProjectionJobOptions(entity: SeriesSourceEntity): {
    source: string;
    deduplication: "coalesce";
    deduplicationKey: string;
    metadata: {
      operationType: "data_processing";
      operationTarget: string;
    };
  } {
    return {
      source: this.id,
      deduplication: "coalesce",
      deduplicationKey: `series-source:${entity.entityType}:${entity.id}`,
      metadata: {
        operationType: "data_processing",
        operationTarget: `series:${entity.entityType}:${entity.id}`,
      },
    };
  }

  /**
   * Project series from one source entity.
   */
  private async projectSource(source: BaseEntity): Promise<void> {
    await this.requireManager().handleEntityChange(source);
  }

  private async projectAll(context: EntityPluginContext): Promise<void> {
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
