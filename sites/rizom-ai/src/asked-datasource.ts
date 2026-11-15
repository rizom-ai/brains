import { proximityMapDataSchema } from "@brains/agent-discovery/proximity-map";
// A published site bundles its declarations; this entry carries no runtime.
import {
  defineDataSource,
  type DataSourceDefinition,
} from "@brains/sdk/internal/site-runtime";
import { askedSchema } from "./asked";

/** How many kept questions the chapter shows, most asked first. */
const LIMIT = 12;
/** The live map's datasource, which agent-discovery declares. */
const MAP_SOURCE = "@brains/agent-discovery:proximity-map";
const faqList = askedSchema.pick({ faqs: true });
const emptyMap = {
  center: { kind: "identity" },
  nodes: [],
  clusters: [],
  sightings: [],
  distanceRange: { min: 0, max: 0 },
  pendingCount: 0,
};

/**
 * The "Asked before" chapter's data: the published FAQs, read through the faq
 * plugin's own datasource so drafts stay out the way its own lists keep them
 * out, and so this site carries no FAQ runtime, over the live network. None
 * where the brain keeps no FAQs, and the chapter renders nothing.
 */
export const askedDataSource: DataSourceDefinition = defineDataSource({
  id: "asked",
  name: "Rizom Asked DataSource",
  description:
    "The published FAQs, with their sources, over the live network for the Asked-before chapter",
  fetch: async (query, _entities, context) => {
    const [kept, network] = await Promise.all([
      context.dataSources.fetch(
        "@brains/faq:entities",
        { query: { limit: LIMIT } },
        faqList,
      ),
      context.dataSources.fetch(MAP_SOURCE, query, proximityMapDataSchema),
    ]);
    return {
      ...(network ?? proximityMapDataSchema.parse(emptyMap)),
      faqs: (kept ?? faqList.parse({ faqs: [] })).faqs,
    };
  },
});
