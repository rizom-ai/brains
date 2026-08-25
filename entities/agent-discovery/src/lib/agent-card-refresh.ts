import type { EntityCheckDeclaration } from "@brains/sdk/entities";
import { refreshKnownAgentCards } from "./atproto-card-events";

/**
 * Agent cards go stale: a peer moves, republishes, or disappears.
 *
 * Daily rather than on demand, and with alerts off — a card that failed to
 * refresh is directory drift, not something to wake anyone for. It shows in
 * the network widget as a stale entry.
 */
export const agentCardRefreshCheck: EntityCheckDeclaration = {
  id: "agent-card-refresh",
  cadence: "daily",
  deliverAlerts: false,
  run: async ({ signal, ...context }) => {
    await refreshKnownAgentCards(context, undefined, signal);
    return {};
  },
};
