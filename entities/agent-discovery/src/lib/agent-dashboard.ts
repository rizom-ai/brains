import type { EntityPluginContext } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { buildAgentNetworkWidgetData } from "./agent-network-widget";

const networkDigestSourceSchema = z.object({
  counts: z.object({ agents: z.number(), skills: z.number() }),
});
import {
  AgentNetworkWidget,
  agentNetworkWidgetScript,
} from "../widgets/agent-network-widget";
import {
  AGENT_NETWORK_WIDGET_ID,
  AGENT_NETWORK_WIDGET_RENDERER,
} from "./constants";

export function registerAgentNetworkDashboardWidget(
  context: EntityPluginContext,
  pluginId: string,
): void {
  context.messaging.subscribe(
    "system:plugins:ready",
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

      return { success: true };
    },
  );
}
