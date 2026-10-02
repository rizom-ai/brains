import type { EntityPluginContext, EntityTypeConfig } from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { NetworkPieceAdapter } from "../adapters/network-piece-adapter";
import {
  NETWORK_PIECE_ENTITY_TYPE,
  networkPieceSchema,
  type NetworkPieceEntity,
} from "../schemas/network-piece";
import { AGENT_DISCOVERY_PLUGIN_ID } from "../lib/constants";
import type { AtprotoCardFetch } from "../lib/atproto-card-events";
import { syncNetworkPieces } from "../lib/network-pieces-sync";
import {
  createSafePublicFetch,
  type ResolveHostname,
} from "@brains/utils/safe-public-fetch";
import packageJson from "../../package.json";

export const NETWORK_PIECES_PLUGIN_ID = "network-pieces";

const networkPieceAdapter: NetworkPieceAdapter = new NetworkPieceAdapter();

/** The plugin takes no configuration: the directory decides whose pieces are kept. */
export const networkPiecePluginConfigSchema: z.ZodObject<
  Record<string, never>,
  z.core.$strict
> = z.strictObject({});
export type NetworkPiecePluginConfig = z.output<
  typeof networkPiecePluginConfigSchema
>;

/**
 * The connected brains' published pieces, kept in this brain to answer
 * visitors (see ../lib/network-pieces-sync). Public, searchable and citable to
 * their brain; never this brain's own site pages, never re-published.
 */
export class NetworkPiecePlugin extends EntityPlugin<
  NetworkPieceEntity,
  NetworkPiecePluginConfig,
  NetworkPiecePluginConfig
> {
  readonly entityType: typeof NETWORK_PIECE_ENTITY_TYPE =
    NETWORK_PIECE_ENTITY_TYPE;
  readonly schema: typeof networkPieceSchema = networkPieceSchema;
  readonly adapter: NetworkPieceAdapter = networkPieceAdapter;
  readonly dependencies: string[] = [AGENT_DISCOVERY_PLUGIN_ID];
  private readonly fetchFn: AtprotoCardFetch | undefined;

  constructor(
    config: NetworkPiecePluginConfig = {},
    deps: {
      fetchFn?: AtprotoCardFetch | undefined;
      resolveHostname?: ResolveHostname | undefined;
    } = {},
  ) {
    super(
      NETWORK_PIECES_PLUGIN_ID,
      packageJson,
      config,
      networkPiecePluginConfigSchema,
    );
    // Homes and repositories are public reads of addresses other owners
    // chose: resolved to public addresses only, bounded in time and size.
    this.fetchFn = createSafePublicFetch({
      ...(deps.fetchFn && { fetchFn: deps.fetchFn }),
      ...(deps.resolveHostname && { resolveHostname: deps.resolveHostname }),
      timeoutMs: 15_000,
      maxResponseBytes: 8 * 1024 * 1024,
      maxRedirects: 3,
    });
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return {
      classification: "content",
      embeddable: true,
      fullTextSearchable: true,
      includeInBroadSearch: true,
      // Another brain's work is never this brain's source material to derive
      // from, and never re-published under this brain's name.
      projectionSource: false,
      projectionSourceRole: "excluded",
      publish: { publishStatuses: ["published"] },
    };
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    context.recurringChecks.register({
      id: "network-pieces-sync",
      cadence: "daily",
      deliverAlerts: false,
      includeInInbox: false,
      run: async ({ signal }) => {
        await syncNetworkPieces(context, this.fetchFn ?? fetch, signal);
        return {};
      },
    });
  }
}

export function networkPiecePlugin(
  config: NetworkPiecePluginConfig = {},
  deps: { fetchFn?: AtprotoCardFetch | undefined } = {},
): NetworkPiecePlugin {
  return new NetworkPiecePlugin(config, deps);
}
