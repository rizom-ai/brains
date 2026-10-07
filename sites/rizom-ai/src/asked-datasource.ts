import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
} from "@brains/plugins";
import { proximityMapDataSchema } from "@brains/agent-discovery/proximity-map";
import { z } from "@rizom/site";
import { askedSchema } from "./asked";

const faqSection = z.object({ faqs: askedSchema.shape.faqs });
const emptyMap = {
  center: { kind: "identity" },
  nodes: [],
  clusters: [],
  sightings: [],
  distanceRange: { min: 0, max: 0 },
  pendingCount: 0,
};

/** Host-resolved declarative sources; this composition carries no entity runtime or registry. */
export function askedDataSource(loaders: {
  faq: () => DataSource | undefined;
  map: () => DataSource | undefined;
}): DataSource {
  return {
    id: "rizom:asked",
    name: "Rizom Asked DataSource",
    description: "Public FAQs and their kept sources over the live network",
    async fetch<T>(
      _query: unknown,
      schema: DataSourceSchema<T>,
      context: BaseDataSourceContext,
    ): Promise<T> {
      const [faqs, map] = await Promise.all([
        loaders
          .faq()
          ?.fetch?.({ query: { limit: 12 } }, faqSection, context) ?? {
          faqs: [],
        },
        loaders.map()?.fetch?.({}, proximityMapDataSchema, context) ??
          proximityMapDataSchema.parse(emptyMap),
      ]);
      return schema.parse({ ...map, faqs: faqs.faqs });
    },
  };
}
