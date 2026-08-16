import {
  SYSTEM_CHANNELS,
  defineDashboardWidget,
  registerBuiltInDashboardWidget,
  type EntityPluginContext,
  type DashboardOperatorViewBlock,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  AGENT_NETWORK_KINDS,
  agentNetworkWidgetDataSchema,
  buildAgentNetworkWidgetData,
} from "./agent-network-widget";
import { buildProximityMapData } from "./proximity-map-data";
import { proximityMapDataSchema } from "./proximity-map-schema";

const agentNetworkDashboardDataSchema = agentNetworkWidgetDataSchema.extend({
  canInvite: z.boolean(),
});

const agentNetworkWidget = defineDashboardWidget({
  id: AGENT_NETWORK_WIDGET_ID,
  title: "Agent Network",
  group: "network",
  placement: "secondary",
  priority: 15,
  permission: "public",
  data: agentNetworkDashboardDataSchema,
  digest: ({ data }) => ({
    items: [
      { label: "Agents", value: String(data.counts.agents) },
      { label: "Skills", value: String(data.counts.skills) },
    ],
  }),
  view: ({ data }) => ({
    blocks: [
      {
        type: "tabs",
        id: "network-views",
        label: "Browse the agent network",
        defaultTab: "agents",
        tabs: [
          {
            id: "agents",
            label: "Agents",
            count: data.counts.agents,
            blocks: [
              {
                type: "list",
                id: "agents",
                empty: "Nothing to show yet.",
                filter: {
                  label: "Filter agents by kind",
                  defaultValue: "all",
                  options: AGENT_NETWORK_KINDS.map((kind) => ({
                    value: kind,
                    label: kind,
                    count: data.agents[kind].length,
                  })),
                },
                items: data.agents.all.map((agent) => ({
                  id: agent.id,
                  title: agent.name,
                  description: agent.description,
                  tags: agent.tags,
                  filterValues: [agent.kind],
                  ...(agent.status === "discovered"
                    ? { badges: [{ label: "review", tone: "warn" }] }
                    : agent.status === "archived"
                      ? { badges: [{ label: "archived", tone: "neutral" }] }
                      : {}),
                  ...(data.canInvite && agent.status === "approved"
                    ? {
                        links: [
                          {
                            label: "Invite person",
                            target: {
                              launch: {
                                target: "admin-peer-invite",
                                peerId: agent.id,
                                displayName:
                                  agent.name.split(" · ", 1)[0] ?? agent.name,
                              },
                            },
                          },
                        ],
                      }
                    : {}),
                })),
              },
            ],
          },
          {
            id: "skills",
            label: "Skills",
            count: data.counts.skills,
            blocks: [
              {
                type: "list",
                id: "network-skills",
                empty: "Nothing to show yet.",
                filter: {
                  label: "Filter skills by tag",
                  defaultValue: "all",
                  options: [
                    {
                      value: "all",
                      label: "all",
                      count: data.counts.skills,
                    },
                    ...data.skillFilters.map(
                      (
                        filter,
                      ): {
                        value: string;
                        label: string;
                        count: number;
                        emphasis?: "gap" | undefined;
                      } => ({
                        value: filter.tag,
                        label: filter.tag,
                        count: filter.count,
                        ...(filter.variant === "gap"
                          ? { emphasis: "gap" }
                          : {}),
                      }),
                    ),
                  ],
                },
                items: data.skills.map((skill) => ({
                  id: skill.id,
                  title: skill.name,
                  tags: skill.tags,
                  filterValues: skill.tags,
                  badges: [
                    {
                      label: skill.sourceLabel,
                      tone: skill.sourceType === "brain" ? "good" : "neutral",
                    },
                  ],
                })),
              },
            ],
          },
        ],
      },
    ],
  }),
});
import {
  AGENT_NETWORK_WIDGET_ID,
  AGENT_PROXIMITY_WIDGET_ID,
} from "./constants";

function proximityTone(
  status: "approved" | "archived" | "discovered",
): "good" | "warn" | "neutral" {
  if (status === "approved") return "good";
  if (status === "discovered") return "warn";
  return "neutral";
}

function pendingProximityBlocks(count: number): DashboardOperatorViewBlock[] {
  return count > 0
    ? [
        {
          type: "notice",
          tone: "neutral",
          text: `${count} agent(s) are pending semantic indexing.`,
        },
      ]
    : [];
}

const agentProximityWidget = defineDashboardWidget({
  id: AGENT_PROXIMITY_WIDGET_ID,
  title: "Agent Proximity",
  group: "network",
  placement: "primary",
  priority: 35,
  permission: "public",
  data: proximityMapDataSchema,
  digest: ({ data }) => ({
    items: [
      { label: "Agents", value: String(data.nodes.length) },
      { label: "Clusters", value: String(data.clusters.length) },
      { label: "Pending", value: String(data.pendingCount) },
    ],
  }),
  view: ({ data }) => {
    const relationships = [
      ...data.clusters.flatMap((cluster) =>
        cluster.links.map(
          (
            link,
          ): {
            sourceId: string;
            targetId: string;
            tone: "good";
          } => ({
            sourceId: link.sourceId,
            targetId: link.targetId,
            tone: "good",
          }),
        ),
      ),
      ...data.sightings.flatMap((sighting) =>
        sighting.viaIds.map(
          (
            viaId,
          ): {
            sourceId: string;
            targetId: string;
            tone: "warn";
          } => ({
            sourceId: viaId,
            targetId: sighting.id,
            tone: "warn",
          }),
        ),
      ),
    ];
    return {
      blocks: [
        {
          type: "spatial",
          layout: "radial",
          id: "agent-proximity",
          label: "Agent proximity map",
          description:
            data.center.kind === "identity"
              ? "Agents arranged by semantic distance from this Brain identity."
              : "Agents arranged around the semantic centroid while identity indexing is unavailable.",
          centerLabel:
            data.center.kind === "identity" ? "Brain identity" : "Centroid",
          centerKind: data.center.kind,
          points: [
            ...data.nodes.map((node) => {
              const clusterPeers = data.clusters
                .filter((cluster) => cluster.memberIds.includes(node.id))
                .flatMap((cluster) => cluster.memberIds)
                .filter((id) => id !== node.id);
              const introduced = data.sightings
                .filter((sighting) => sighting.viaIds.includes(node.id))
                .map((sighting) => sighting.id);
              return {
                id: node.id,
                label: node.name,
                kind: node.kind,
                status: node.status,
                tags: node.tags,
                distance: node.distance,
                bearing: node.bearing,
                relatedIds: [...new Set([...clusterPeers, ...introduced])],
                tone: proximityTone(node.status),
              };
            }),
            ...data.sightings.map((sighting) => ({
              id: sighting.id,
              label: sighting.name,
              kind: "sighting",
              status: "reported",
              tags: sighting.tags,
              distance: sighting.distance,
              bearing: sighting.bearing,
              relatedIds: sighting.viaIds,
              tone: proximityTone("discovered"),
              details: [`Introduced by ${sighting.viaIds.length} agent(s)`],
            })),
          ],
          clusters: data.clusters.map((cluster, index) => ({
            id: `cluster-${index}`,
            label: cluster.label,
            memberIds: cluster.memberIds,
          })),
          relationships,
          strata: [
            { id: "near", label: "Near", maxDistance: 0.33 },
            { id: "mid", label: "Mid-range", maxDistance: 0.66 },
            { id: "far", label: "Far", maxDistance: 1 },
          ],
          legend: [
            { label: "Approved", tone: "good" },
            { label: "Pending review", tone: "warn" },
            { label: "Archived", tone: "neutral" },
            { label: "Second-order sighting", tone: "warn" },
          ],
        },
        ...pendingProximityBlocks(data.pendingCount),
      ],
    };
  },
});

export function registerAgentNetworkDashboardWidget(
  context: EntityPluginContext,
): void {
  context.messaging.subscribe(
    SYSTEM_CHANNELS.pluginsRegistered,
    async (): Promise<{ success: boolean }> => {
      await registerBuiltInDashboardWidget({
        context,
        definition: agentNetworkWidget,
        load: async ({ caller, signal }) => {
          signal.throwIfAborted();
          const data = await buildAgentNetworkWidgetData(context);
          signal.throwIfAborted();
          return { ...data, canInvite: caller?.permission === "admin" };
        },
      });

      await registerBuiltInDashboardWidget({
        context,
        definition: agentProximityWidget,
        load: async ({ signal }) => {
          signal.throwIfAborted();
          const data = await buildProximityMapData(context);
          signal.throwIfAborted();
          return data;
        },
      });

      return { success: true };
    },
  );
}
