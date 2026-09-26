import {
  defineDataSource,
  type DataSourceDefinition,
} from "@brains/sdk/entities";
import { AGENT_PROXIMITY_DATASOURCE_ID } from "../lib/constants";
import { buildProximityMapData } from "../lib/proximity-map-data";

/**
 * Public site data source for the semantic agent proximity map.
 *
 * Semantic projection stays behind the entity service; this receives only
 * provider-independent coordinates, distances, and neighbour relationships.
 */
export const proximityMapDataSource: DataSourceDefinition = defineDataSource({
  id: AGENT_PROXIMITY_DATASOURCE_ID,
  name: "Agent Proximity Map DataSource",
  description: "Builds a public semantic proximity map for saved agents",
  fetch: async (_query, entities) =>
    buildProximityMapData({ entities, semantic: entities }),
});
