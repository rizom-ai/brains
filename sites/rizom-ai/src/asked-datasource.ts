import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
  IShell,
} from "@brains/plugins";
import { proximityMapDataSchema } from "@brains/agent-discovery/proximity-map";
import { askedSchema } from "./asked";

/** How many kept questions the chapter shows, most asked first. */
const LIMIT = 12;
const MAP_SOURCE_ID = "agent-discovery:proximity-map";
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
 * out, and so this site carries no FAQ runtime. None where the brain keeps
 * no FAQs, and the chapter renders nothing.
 */
export interface AskedSources {
  faqs: () => DataSource | undefined;
  /** The live map's datasource, registered by agent-discovery; absent when the plugin is not loaded. */
  map: () => DataSource | undefined;
}

export class RizomAskedDataSource implements DataSource {
  public readonly id = "rizom:asked";
  public readonly name = "Rizom Asked DataSource";
  public readonly description =
    "The published FAQs, with their sources, over the live network for the Asked-before chapter";
  private readonly sources: AskedSources;

  constructor(sources: AskedSources) {
    this.sources = sources;
  }

  async fetch<T>(
    query: unknown,
    outputSchema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const faqs = this.sources.faqs();
    const map = this.sources.map();
    const [kept, network] = await Promise.all([
      faqs?.fetch
        ? faqs.fetch({ query: { limit: LIMIT } }, faqList, context)
        : faqList.parse({ faqs: [] }),
      map?.fetch
        ? map.fetch(query, proximityMapDataSchema, context)
        : proximityMapDataSchema.parse(emptyMap),
    ]);
    return outputSchema.parse({ ...network, faqs: kept.faqs });
  }
}

/** The datasource on the brain's shell, built when the site's plugin registers. */
export function askedDataSource(shell: IShell): DataSource {
  const registry = shell.getDataSourceRegistry();
  return new RizomAskedDataSource({
    faqs: () => registry.get("faq:entities"),
    map: () => registry.get(MAP_SOURCE_ID),
  });
}
