import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
} from "@brains/plugins";
import { AGENT_PROXIMITY_DATASOURCE_ID } from "../lib/constants";
import { buildProximityMapData } from "../lib/proximity-map-data";

/**
 * Public site datasource for the semantic agent proximity map.
 *
 * Semantic projection stays behind entity-service; the datasource receives only
 * provider-independent coordinates, distances, and neighbor relationships.
 */
export class ProximityMapDataSource implements DataSource {
  readonly id: typeof AGENT_PROXIMITY_DATASOURCE_ID =
    AGENT_PROXIMITY_DATASOURCE_ID;
  readonly name = "Agent Proximity Map DataSource";
  readonly description =
    "Builds a public semantic proximity map for saved agents";

  async fetch<T>(
    _query: unknown,
    outputSchema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const data = await buildProximityMapData({
      entityService: context.entityService,
      semantic: {
        project: (request) =>
          context.entityService.projectSemanticSpace(request),
      },
    });

    return outputSchema.parse(data);
  }
}
