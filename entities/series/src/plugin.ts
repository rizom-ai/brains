import type {
  Plugin,
  EntityPluginContext,
  EntityTypeConfig,
  JobHandler,
  DataSource,
  Template,
  ProjectionRule,
} from "@brains/plugins";
import { EntityPlugin, emptyEntityPluginConfigSchema } from "@brains/plugins";
import { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import { seriesSchema, type Series } from "./schemas/series";
import { seriesAdapter, type SeriesAdapter } from "./adapters/series-adapter";
import { SeriesDataSource } from "./datasources/series-datasource";
import { SeriesGenerationHandler } from "./handlers/seriesGenerationHandler";
import { getTemplates } from "./lib/register-templates";
import { createSeriesProjectionRule } from "./lib/series-projection";
import { seriesDescriptionTemplate } from "./templates/description-template";
import { createSeriesAtprotoProjection } from "./atproto-projection";
import packageJson from "../package.json";

/**
 * Series EntityPlugin — derives series from entities with seriesName metadata.
 */
export class SeriesPlugin extends EntityPlugin<
  Series,
  Record<string, never>,
  Record<string, never>
> {
  readonly entityType = "series" as const;
  readonly schema: typeof seriesSchema = seriesSchema;
  readonly adapter: SeriesAdapter = seriesAdapter;
  private unregisterAtprotoProjection: (() => void) | undefined;

  constructor() {
    super("series", packageJson, {}, emptyEntityPluginConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return { weight: 0.5, projectionSourceRole: "supporting" };
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

  protected override getProjectionRules(
    _context: EntityPluginContext,
  ): ProjectionRule[] {
    return [createSeriesProjectionRule()];
  }

  protected override async onRegister(
    _context: EntityPluginContext,
  ): Promise<void> {
    this.unregisterAtprotoProjection =
      AtprotoProjectionRegistry.getInstance().register(
        createSeriesAtprotoProjection(),
      );
  }

  protected override async onShutdown(): Promise<void> {
    this.unregisterAtprotoProjection?.();
    this.unregisterAtprotoProjection = undefined;
  }
}

export function seriesPlugin(): Plugin {
  return new SeriesPlugin();
}
