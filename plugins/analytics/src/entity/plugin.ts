import {
  EntityPlugin,
  emptyEntityPluginConfigSchema,
  type EntityPluginContext,
  type EntityTypeConfig,
} from "@brains/plugins";
import packageJson from "../../package.json";
import { trafficSnapshotAdapter, type TrafficSnapshotAdapter } from "./adapter";
import { trafficSnapshotSchema, type TrafficSnapshot } from "./schema";

/**
 * Entity half of traffic analytics: the weekly snapshots the capture writes.
 * Operational numbers, so they stay out of search, embeddings and projections.
 */
export class TrafficSnapshotPlugin extends EntityPlugin<
  TrafficSnapshot,
  Record<string, never>,
  Record<string, never>
> {
  readonly entityType = "traffic-snapshot" as const;
  readonly schema: typeof trafficSnapshotSchema = trafficSnapshotSchema;
  readonly adapter: TrafficSnapshotAdapter = trafficSnapshotAdapter;

  constructor() {
    super("traffic-snapshot", packageJson, {}, emptyEntityPluginConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig {
    return {
      embeddable: false,
      fullTextSearchable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    };
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.entities.registerPersistValidator(
      this.entityType,
      async (entity) => {
        if (entity.visibility !== "restricted") {
          throw new Error("Traffic snapshots must have restricted visibility");
        }
        trafficSnapshotAdapter.parseContent(entity.content);
      },
    );
  }
}
