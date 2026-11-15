import type { ServiceDataSourceDeclaration } from "@brains/sdk/internal/service-runtime";
import { buildProximityMapData } from "../lib/proximity-map-data";

/**
 * Public site datasource for the semantic agent proximity map, served as
 * agent-discovery:proximity-map.
 *
 * Semantic projection stays behind entity-service; the datasource receives only
 * provider-independent coordinates, distances, and neighbor relationships.
 */
export const proximityMapDataSource: ServiceDataSourceDeclaration = {
  id: "proximity-map",
  name: "Agent Proximity Map DataSource",
  description: "Builds a public semantic proximity map for saved agents",
  // The public site: public agents only, made explicit rather than left to
  // the entity service default.
  fetch: (_query, { corpus }) =>
    buildProximityMapData(
      {
        entityService: {
          listEntities: async (request, schema) =>
            (await corpus.listEntities(request)).map((entity) =>
              schema.parse(entity),
            ),
        },
        semantic: {
          project: (request) => corpus.projectSemanticSpace(request),
        },
      },
      "public",
    ),
};
