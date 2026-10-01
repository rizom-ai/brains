import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
  IShell,
} from "@brains/plugins";
import { createInterfaceAvailabilityReader } from "@brains/plugins/internal/interface-availability";
import { proximityMapDataSchema } from "@brains/agent-discovery/proximity-map";
import { homepageChatAvailable, loadAskContent } from "@brains/site-atlas";

const MAP_SOURCE_ID = "@brains/agent-discovery:agent:proximity-map";

/** Where the opening's data comes from, read with the plugin's runtime. */
export interface OpeningLoaders {
  /** The live map's datasource, registered by agent-discovery; absent when the plugin is not loaded. */
  mapSource: () => DataSource | undefined;
  loadOpening: (context: BaseDataSourceContext) => Promise<{
    title?: string | undefined;
    topics?: string[] | undefined;
  } | null>;
  chatAvailable: (context: BaseDataSourceContext) => Promise<boolean>;
}

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
 * runtime that builds it; the box's availability is read from the shell's
 * runtime state, so the site bundles no plugin runtime either.
 */
export class RizomOpeningDataSource implements DataSource {
  public readonly id = "rizom:opening";
  public readonly name = "Rizom Opening DataSource";
  public readonly description =
    "The live network, the Ask questions and the box's availability for the homepage opening";

  private readonly loaders: OpeningLoaders;

  constructor(loaders: OpeningLoaders) {
    this.loaders = loaders;
  }

  async fetch<T>(
    query: unknown,
    outputSchema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const mapSource = this.loaders.mapSource();
    const [map, opening, askBox] = await Promise.all([
      mapSource?.fetch
        ? mapSource.fetch(query, proximityMapDataSchema, context)
        : proximityMapDataSchema.parse(emptyMap),
      this.loaders.loadOpening(context),
      this.loaders.chatAvailable(context),
    ]);
    return outputSchema.parse({
      ...map,
      topics: opening?.topics ?? [],
      prompt: opening?.title ?? null,
      askBox,
    });
  }
}

/** The datasource on the brain's shell, built when the site's plugin registers. */
export function openingDataSource(shell: IShell): DataSource {
  const runtime = {
    interfaceAvailability: createInterfaceAvailabilityReader(
      shell.getRuntimeState(),
    ),
  };
  return new RizomOpeningDataSource({
    mapSource: () => shell.getDataSourceRegistry().get(MAP_SOURCE_ID),
    loadOpening: loadAskContent,
    chatAvailable: (buildContext) =>
      homepageChatAvailable(buildContext, runtime),
  });
}
