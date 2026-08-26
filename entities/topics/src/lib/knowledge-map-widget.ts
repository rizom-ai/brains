import {
  SYSTEM_CHANNELS,
  defineDashboardWidget,
  registerBuiltInDashboardWidget,
  type EntityPluginContext,
} from "@brains/plugins";
import {
  buildKnowledgeMapData,
  knowledgeMapDataSchema,
} from "./knowledge-map-data";
import {
  KnowledgeMapWidget,
  knowledgeMapStyles,
} from "../widgets/knowledge-map";

export const KNOWLEDGE_MAP_WIDGET_ID = "topics-knowledge-map";

function knowledgePointId(entityType: string, id: string): string {
  return `${entityType}:${id}`;
}

const knowledgeMapWidget = defineDashboardWidget({
  id: KNOWLEDGE_MAP_WIDGET_ID,
  title: "Knowledge Map",
  group: "knowledge",
  placement: "primary",
  priority: 30,
  permission: "public",
  data: knowledgeMapDataSchema,
  digest: ({ data }) => ({
    items: [
      { label: "Entities", value: String(data.counts.entities) },
      { label: "Topics", value: String(data.counts.topics) },
    ],
  }),
  view: ({ data }) => ({
    blocks: [
      {
        type: "spatial",
        layout: "cartesian",
        id: "knowledge-map",
        label: "Knowledge map",
        description: `${data.counts.entities} projected entities arranged around ${data.counts.topics} topic zones. Published work, skills, high-signal knowledge, and background sources remain available in the text detail for this map.`,
        points: data.points.map((point) => ({
          id: knowledgePointId(point.entityType, point.id),
          label: point.title,
          category: point.kind === "pearl" ? "high-signal" : point.kind,
          x: point.x,
          y: point.y,
          ...(point.zoneId ? { zoneId: `topic:${point.zoneId}` } : {}),
          tone:
            point.kind === "published"
              ? "good"
              : point.kind === "pearl"
                ? "warn"
                : "neutral",
          details: [point.entityType],
        })),
        zones: data.zones.map((zone) => ({
          id: `topic:${zone.id}`,
          label: zone.name,
          x: zone.x,
          y: zone.y,
          memberIds: data.points
            .filter((point) => zone.memberIds.includes(point.id))
            .map((point) => knowledgePointId(point.entityType, point.id)),
        })),
        relationships: data.zones.flatMap((zone) =>
          data.points
            .filter((point) => point.zoneId === zone.id)
            .map(
              (
                point,
              ): {
                sourceId: string;
                targetId: string;
                tone: "neutral";
              } => ({
                sourceId: `topic:${zone.id}`,
                targetId: knowledgePointId(point.entityType, point.id),
                tone: "neutral",
              }),
            ),
        ),
        legend: [
          { label: "Published", tone: "good" },
          { label: "Skill", tone: "neutral" },
          { label: "High signal", tone: "warn" },
          { label: "Background", tone: "neutral" },
          { label: "Topic zone", tone: "neutral" },
        ],
      },
    ],
  }),
});

/** Register the semantic corpus projection after the Dashboard host mounts. */
export function registerKnowledgeMapDashboardWidget(params: {
  context: EntityPluginContext;
}): void {
  const { context } = params;
  context.messaging.subscribe(
    SYSTEM_CHANNELS.pluginsRegistered,
    async (): Promise<{ success: boolean }> => {
      await registerBuiltInDashboardWidget({
        context,
        definition: knowledgeMapWidget,
        // The console draws the cartographic field itself; the declarative
        // view above stays as the map's text detail and digest.
        render: {
          component: KnowledgeMapWidget,
          clientStyles: knowledgeMapStyles,
        },
        load: async ({ signal }) => {
          signal.throwIfAborted();
          const data = await buildKnowledgeMapData(context);
          signal.throwIfAborted();
          return data;
        },
      });
      return { success: true };
    },
  );
}
