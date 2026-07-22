import { SYSTEM_CHANNELS, type EntityPluginContext } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { buildAgentNetworkWidgetData } from "./agent-network-widget";
import { buildProximityMapData } from "./proximity-map-data";
import { proximityMapDataSchema } from "./proximity-map-schema";

const networkDigestSourceSchema = z.object({
  counts: z.object({ agents: z.number(), skills: z.number() }),
});
import {
  AgentNetworkWidget,
  agentNetworkWidgetScript,
  agentNetworkWidgetStyles,
} from "../widgets/agent-network-widget";
import {
  AgentProximityWidget,
  proximityMapScript,
  proximityMapWidgetStyles,
} from "../widgets/proximity-map";
import {
  AGENT_NETWORK_WIDGET_ID,
  AGENT_NETWORK_WIDGET_RENDERER,
  AGENT_PROXIMITY_WIDGET_ID,
  AGENT_PROXIMITY_WIDGET_RENDERER,
} from "./constants";

export function registerAgentNetworkDashboardWidget(
  context: EntityPluginContext,
  pluginId: string,
): void {
  context.messaging.subscribe(
    SYSTEM_CHANNELS.pluginsRegistered,
    async (): Promise<{ success: boolean }> => {
      await context.messaging.send({
        type: "dashboard:register-widget",
        payload: {
          id: AGENT_NETWORK_WIDGET_ID,
          pluginId,
          title: "Agent Network",
          group: "network",
          section: "secondary",
          priority: 15,
          rendererName: AGENT_NETWORK_WIDGET_RENDERER,
          component: AgentNetworkWidget,
          clientStyles: agentNetworkWidgetStyles,
          clientScript: agentNetworkWidgetScript,
          dataProvider: async () => buildAgentNetworkWidgetData(context),
          digestProvider: (data: unknown) => {
            const { counts } = networkDigestSourceSchema.parse(data);
            return {
              digest: [
                { label: "Agents", value: String(counts.agents) },
                { label: "Skills", value: String(counts.skills) },
              ],
            };
          },
        },
      });

      await context.messaging.send({
        type: "dashboard:register-widget",
        payload: {
          id: AGENT_PROXIMITY_WIDGET_ID,
          pluginId,
          title: "Agent Proximity",
          group: "network",
          section: "primary",
          priority: 35,
          rendererName: AGENT_PROXIMITY_WIDGET_RENDERER,
          component: AgentProximityWidget,
          clientStyles: proximityMapWidgetStyles,
          clientScript: proximityMapScript,
          dataProvider: async () => buildProximityMapData(context),
          digestProvider: (data: unknown) => {
            const parsed = proximityMapDataSchema.parse(data);
            return {
              digest: [
                { label: "Agents", value: String(parsed.nodes.length) },
                { label: "Clusters", value: String(parsed.clusters.length) },
                { label: "Pending", value: String(parsed.pendingCount) },
              ],
            };
          },
        },
      });

      return { success: true };
    },
  );
}
