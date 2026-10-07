import type { ServiceCheckDeclaration } from "@brains/sdk/services";
import {
  createSafePublicFetch,
  type ResolveHostname,
} from "@brains/utils/safe-public-fetch";
import type { AtprotoCardFetch } from "./atproto-card-events";
import { syncNetworkPieces } from "./network-pieces-sync";
export function networkPiecesCheck(
  deps: { fetchFn?: AtprotoCardFetch; resolveHostname?: ResolveHostname } = {},
): ServiceCheckDeclaration {
  const fetchFn = createSafePublicFetch({
    ...deps,
    timeoutMs: 15_000,
    maxResponseBytes: 8 * 1024 * 1024,
    maxRedirects: 3,
  });
  return {
    id: "network-pieces-sync",
    cadence: "daily",
    deliverAlerts: false,
    includeInInbox: false,
    run: async (context): ReturnType<ServiceCheckDeclaration["run"]> => {
      await syncNetworkPieces(context, fetchFn, context.signal);
      return {};
    },
  };
}
