import { proximityMapDataSchema } from "@brains/agent-discovery/proximity-map";
import { askBoxAvailabilityState } from "@brains/contracts";
import {
  defineDataSource,
  type DataSourceDefinition,
} from "@brains/sdk/entities";
import { siteDataSourceRuntime } from "@brains/sdk/internal/site-runtime";
import { homepageChatAvailable, loadAskContent } from "@brains/site-atlas";

/** The live map's datasource, which agent-discovery declares. */
const MAP_SOURCE = "@brains/agent-discovery:proximity-map";

const emptyMap = {
  center: { kind: "identity" },
  nodes: [],
  clusters: [],
  sightings: [],
  distanceRange: { min: 0, max: 0 },
  pendingCount: 0,
};

/**
 * The homepage opening's data: the live proximity map, the drafted Ask
 * questions, and whether Web Chat serves the box. The map is fetched through
 * agent-discovery's own datasource, so this site never carries the entity
 * runtime that builds it; the box's availability is the record Web Chat
 * shares, so the site bundles no plugin runtime either.
 */
export const openingDataSource: DataSourceDefinition = defineDataSource({
  id: "opening",
  name: "Rizom Opening DataSource",
  description:
    "The live network, the Ask questions and the box's availability for the homepage opening",
  fetch: async (query, _entities, context) => {
    const { entityService } = siteDataSourceRuntime(context);
    const [map, opening, askBox] = await Promise.all([
      context.dataSources.fetch(MAP_SOURCE, query, proximityMapDataSchema),
      loadAskContent({ entityService }),
      homepageChatAvailable(
        context,
        context.sharedState(askBoxAvailabilityState),
      ),
    ]);
    return {
      ...(map ?? proximityMapDataSchema.parse(emptyMap)),
      topics: opening?.topics ?? [],
      prompt: opening?.title ?? null,
      askBox,
    };
  },
});
